#!/usr/bin/env python3
"""B7410250 benchmark regression for upstream XML and downstream CII.

Requested benchmark gates:
Step 1a: ATTRIBUTE TXT -> XML, compare against SYS-30-B7410250 [XML BECHMARK].xml.
Step 1b: staged JSON from the same attribute process -> XML, compare against the same XML benchmark.
Step 2 : XML from 1a/1b -> CII using unchanged xml_to_cii2019.py, compare against SYS-30-B7410250 [CII BENCHMARK].cii.

Numeric differences are accepted by normalising all numeric tokens to <NUM>.
All non-numeric text, XML element order, XML element names and CII section/text tokens must match.

This script does not modify xml_to_cii2019.py.
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import subprocess
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

from psi116_upstream_common import parse_attribute_blocks, read_attribute_text

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]
B741_DIR = REPO_ROOT / 'B7410250-BM'
DEFAULT_ATTR = B741_DIR / 'B7410250_STRUCT_SHOE_ATT TXT [INPUT].TXT'
DEFAULT_XML_BM = B741_DIR / 'SYS-30-B7410250 [XML BECHMARK].xml'
DEFAULT_CII_BM = B741_DIR / 'SYS-30-B7410250 [CII BENCHMARK].cii'
NUM_RX = re.compile(r'[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[Ee][-+]?\d+)?')
SPACE_RX = re.compile(r'\s+')
SUMMARY_RX = re.compile(
    r'with\s+(?P<elements>\d+)\s+elements,\s+'
    r'(?P<restraints>\d+)\s+restraints,\s+'
    r'(?P<bends>\d+)\s+bends,\s+'
    r'(?P<siftee>\d+)\s+SIF/tee entries,\s+'
    r'(?P<reducers>\d+)\s+reducers',
    re.I,
)


def local_name(tag: str) -> str:
    return tag.split('}', 1)[1] if tag.startswith('{') else tag


def norm_text(value: str | None) -> str:
    text = '' if value is None else value.strip()
    text = NUM_RX.sub('<NUM>', text)
    return SPACE_RX.sub(' ', text).strip()


def normalize_xml(path: Path) -> list[str]:
    root = ET.parse(path).getroot()
    lines: list[str] = []

    def walk(el: ET.Element, depth: int, index_path: str) -> None:
        attrs = []
        for key in sorted(el.attrib):
            # Namespace URI differences are not numeric, but benchmark and XSD files in this repo use
            # different PSI namespace casing. Preserve element semantics and ignore xmlns casing here.
            if key.lower().endswith('schemaLocation'.lower()):
                continue
            attrs.append(f'{local_name(key)}={norm_text(el.attrib[key])}')
        attr_text = (' ' + ' '.join(attrs)) if attrs else ''
        lines.append(f'{index_path}|{depth}|<{local_name(el.tag)}{attr_text}>|{norm_text(el.text)}')
        counts: dict[str, int] = {}
        for child in list(el):
            name = local_name(child.tag)
            counts[name] = counts.get(name, 0) + 1
            walk(child, depth + 1, f'{index_path}/{name}[{counts[name]}]')
        lines.append(f'{index_path}|{depth}|</{local_name(el.tag)}>|{norm_text(el.tail)}')

    walk(root, 0, f'/{local_name(root.tag)}[1]')
    # The root namespace itself is deliberately not compared; XML->CII uses parsed local elements.
    return lines


def normalize_cii(path: Path) -> list[str]:
    lines = []
    for raw in path.read_text(encoding='utf-8', errors='replace').splitlines():
        line = raw.rstrip()
        if not line:
            lines.append('')
            continue
        lines.append(NUM_RX.sub('<NUM>', line))
    return lines


def diff_lines(actual: list[str], expected: list[str], label: str, out_path: Path) -> dict:
    if actual == expected:
        out_path.write_text('', encoding='utf-8')
        return {'label': label, 'pass': True, 'diffLineCount': 0, 'diffPath': str(out_path)}
    diff = list(difflib.unified_diff(expected, actual, fromfile=f'expected:{label}', tofile=f'actual:{label}', lineterm=''))
    out_path.write_text('\n'.join(diff[:2000]) + ('\n...diff truncated...\n' if len(diff) > 2000 else ''), encoding='utf-8')
    return {'label': label, 'pass': False, 'diffLineCount': len(diff), 'diffPath': str(out_path)}


def run_cmd(args: list[str], cwd: Path) -> str:
    proc = subprocess.run(args, cwd=str(cwd), text=True, capture_output=True)
    print('$ ' + ' '.join(args))
    if proc.stdout:
        print(proc.stdout)
    if proc.stderr:
        print(proc.stderr, file=sys.stderr)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)
    return proc.stdout


def write_staged_json_from_attribute(attribute_path: Path, staged_path: Path) -> dict:
    raw = read_attribute_text(attribute_path)
    if not raw.strip():
        raise SystemExit(f'Input attribute TXT is empty: {attribute_path}. Cannot benchmark a zero-byte input against non-empty XML/CII.')
    blocks = parse_attribute_blocks(raw)
    if not blocks:
        raise SystemExit(f'Input attribute TXT produced zero parsed blocks: {attribute_path}')
    children = []
    for index, block in enumerate(blocks, start=1):
        children.append({
            'id': block.get('ID') or block.get('NAME') or block.get('__NEW__') or f'ATTR-{index}',
            'name': block.get('NAME') or block.get('TAG') or block.get('__NEW__') or f'ATTR-{index}',
            'type': block.get('TYPE') or block.get('__NEW__') or 'UNKNOWN',
            'attributes': block,
            'rawAttributes': block,
        })
    staged = {'id': 'B7410250_ATTRIBUTE_STAGE', 'name': 'B7410250_ATTRIBUTE_STAGE', 'type': 'ROOT', 'children': children}
    staged_path.write_text(json.dumps(staged, indent=2, sort_keys=True), encoding='utf-8')
    return {'blockCount': len(blocks), 'stagedJson': str(staged_path)}


def parse_summary(stdout: str) -> dict:
    match = SUMMARY_RX.search(stdout or '')
    if not match:
        return {}
    return {key: int(value) for key, value in match.groupdict().items()}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--attribute-txt', type=Path, default=DEFAULT_ATTR)
    parser.add_argument('--xml-benchmark', type=Path, default=DEFAULT_XML_BM)
    parser.add_argument('--cii-benchmark', type=Path, default=DEFAULT_CII_BM)
    parser.add_argument('--work-dir', type=Path, default=Path('reports/psi116_b7410250_regression'))
    args = parser.parse_args()

    for required in (args.attribute_txt, args.xml_benchmark, args.cii_benchmark):
        if not required.exists():
            raise SystemExit(f'Missing required benchmark file: {required}')

    work = args.work_dir
    work.mkdir(parents=True, exist_ok=True)

    xml_1a = work / 'B7410250_attribute_to_xml.xml'
    staged = work / 'B7410250_from_attribute.staged.json'
    xml_1b = work / 'B7410250_stagedjson_to_xml.xml'
    cii_1a = work / 'B7410250_attribute_xml_to_cii.cii'
    cii_1b = work / 'B7410250_staged_xml_to_cii.cii'
    report_path = work / 'B7410250_benchmark_report.json'

    inventory = write_staged_json_from_attribute(args.attribute_txt, staged)

    run_cmd([sys.executable, str(SCRIPT_DIR / 'rvm_attribute_to_xml.py'), '--input', str(args.attribute_txt), '--output', str(xml_1a)], REPO_ROOT)
    run_cmd([sys.executable, str(SCRIPT_DIR / 'stagedjson_to_xml.py'), '--input', str(staged), '--output', str(xml_1b)], REPO_ROOT)

    expected_xml = normalize_xml(args.xml_benchmark)
    step1a = diff_lines(normalize_xml(xml_1a), expected_xml, 'Step 1a ATTRIBUTE TXT TO XML vs XML benchmark', work / 'step1a_xml.diff')
    step1b = diff_lines(normalize_xml(xml_1b), expected_xml, 'Step 1b StagedJSON TO XML vs XML benchmark', work / 'step1b_xml.diff')

    out_1a = run_cmd([sys.executable, str(SCRIPT_DIR / 'xml_to_cii2019.py'), '--input', str(xml_1a), '--output', str(cii_1a)], REPO_ROOT)
    out_1b = run_cmd([sys.executable, str(SCRIPT_DIR / 'xml_to_cii2019.py'), '--input', str(xml_1b), '--output', str(cii_1b)], REPO_ROOT)

    expected_cii = normalize_cii(args.cii_benchmark)
    step2a = diff_lines(normalize_cii(cii_1a), expected_cii, 'Step 2 XML 1a TO CII vs CII benchmark', work / 'step2a_cii.diff')
    step2b = diff_lines(normalize_cii(cii_1b), expected_cii, 'Step 2 XML 1b TO CII vs CII benchmark', work / 'step2b_cii.diff')

    report = {
        'inputs': {
            'attributeTxt': str(args.attribute_txt),
            'xmlBenchmark': str(args.xml_benchmark),
            'ciiBenchmark': str(args.cii_benchmark),
        },
        'inventory': inventory,
        'outputs': {
            'xml1a': str(xml_1a),
            'stagedJson': str(staged),
            'xml1b': str(xml_1b),
            'cii1a': str(cii_1a),
            'cii1b': str(cii_1b),
        },
        'ciiSummaries': {
            'from1a': parse_summary(out_1a),
            'from1b': parse_summary(out_1b),
        },
        'checks': [step1a, step1b, step2a, step2b],
    }
    report['pass'] = all(check['pass'] for check in report['checks'])
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding='utf-8')
    print(json.dumps(report, indent=2, sort_keys=True))

    if not report['pass']:
        raise SystemExit('B7410250 benchmark regression failed. See generated diff files under reports/psi116_b7410250_regression/.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

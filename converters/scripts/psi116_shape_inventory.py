#!/usr/bin/env python3
"""Produce a non-mutating PSI116 XML shape inventory.

P0 purpose:
- Compare benchmark XML vs generated XML before changing mapping logic.
- Count positive stress nodes separately from negative helper/attachment nodes.
- Mirror unchanged xml_to_cii.py candidate predicates for bend/SIF/reducer/rigid/restraint visibility.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET


def local(tag: str) -> str:
    return tag.split('}', 1)[1] if tag.startswith('{') else tag


def namespace(tag: str) -> str:
    return tag[1:].split('}', 1)[0] if tag.startswith('{') else ''


def q(ns: str, name: str) -> str:
    return f'{{{ns}}}{name}' if ns else name


def txt(parent: ET.Element, ns: str, name: str) -> str:
    el = parent.find(q(ns, name))
    return '' if el is None or el.text is None else el.text.strip()


def as_int(value: str):
    try:
        return int((value or '').strip())
    except Exception:
        return None


def as_float(value: str):
    try:
        text = (value or '').strip()
        return float(text) if text else None
    except Exception:
        return None


def inc_nested(counter: dict, key1: str, key2: str) -> None:
    counter.setdefault(key1, Counter())[key2] += 1


def analyze(path: Path) -> dict:
    root = ET.parse(path).getroot()
    ns = namespace(root.tag)
    result = {
        'file': str(path),
        'root': local(root.tag),
        'namespace': ns,
        'metadata': {
            'source': txt(root, ns, 'Source'),
            'version': txt(root, ns, 'Version'),
            'purpose': txt(root, ns, 'Purpose'),
            'projectName': txt(root, ns, 'ProjectName'),
            'mdbName': txt(root, ns, 'MDBName'),
            'restrainOpenEnds': txt(root, ns, 'RestrainOpenEnds'),
            'ambientTemperature': txt(root, ns, 'AmbientTemperature'),
        },
        'counts': {},
        'componentCounts': {},
        'endpointCountsByComponent': {},
        'nodeNumberSignCountsByComponent': {},
        'rigidCountsByComponent': {},
        'branchSummaries': [],
        'ciiDetectable': {},
        'samples': {'firstPositiveNodes': [], 'firstNegativeNodes': []},
    }

    component_counts: Counter[str] = Counter()
    endpoint_counts: dict[str, Counter] = {}
    sign_counts: dict[str, Counter] = {}
    rigid_counts: dict[str, Counter] = {}
    negative_numbers: Counter[str] = Counter()
    positive_count = negative_count = zero_count = node_count = restraint_nodes = 0
    branch_count = pipe_count = 0
    edges = []
    units_present = root.find(q(ns, 'Units')) is not None

    for pipe in root.findall(q(ns, 'Pipe')):
        pipe_count += 1
        for branch_index, branch in enumerate(pipe.findall(q(ns, 'Branch')), start=1):
            branch_count += 1
            branch_nodes = []
            branch_summary = {
                'index': branch_index,
                'branchName': txt(branch, ns, 'Branchname'),
                'nodeCount': 0,
                'positiveNodes': 0,
                'negativeNodes': 0,
                'componentCounts': {},
            }
            branch_component_counts: Counter[str] = Counter()
            for node in branch.findall(q(ns, 'Node')):
                node_count += 1
                branch_summary['nodeCount'] += 1
                num = as_int(txt(node, ns, 'NodeNumber'))
                endpoint = as_int(txt(node, ns, 'Endpoint'))
                rigid = as_int(txt(node, ns, 'Rigid'))
                alpha = as_float(txt(node, ns, 'AlphaAngle'))
                ctype = (txt(node, ns, 'ComponentType') or 'UNKNOWN').upper()
                component_counts[ctype] += 1
                branch_component_counts[ctype] += 1
                inc_nested(endpoint_counts, ctype, str(endpoint) if endpoint is not None else '')
                inc_nested(rigid_counts, ctype, str(rigid) if rigid is not None else '')
                if node.findall(q(ns, 'Restraint')):
                    restraint_nodes += 1
                if num is None:
                    inc_nested(sign_counts, ctype, 'missing')
                    continue
                if num > 0:
                    positive_count += 1
                    branch_summary['positiveNodes'] += 1
                    inc_nested(sign_counts, ctype, 'positive')
                    row = {'nodeNumber': num, 'componentType': ctype, 'endpoint': endpoint, 'rigid': rigid, 'alphaAngle': alpha}
                    if len(result['samples']['firstPositiveNodes']) < 20:
                        result['samples']['firstPositiveNodes'].append(row)
                    branch_nodes.append(row)
                elif num < 0:
                    negative_count += 1
                    branch_summary['negativeNodes'] += 1
                    negative_numbers[str(num)] += 1
                    inc_nested(sign_counts, ctype, f'negative:{num}')
                    if len(result['samples']['firstNegativeNodes']) < 20:
                        result['samples']['firstNegativeNodes'].append({'nodeNumber': num, 'componentType': ctype, 'endpoint': endpoint, 'rigid': rigid})
                else:
                    zero_count += 1
                    inc_nested(sign_counts, ctype, 'zero')
            for i in range(len(branch_nodes) - 1):
                edges.append((branch_nodes[i], branch_nodes[i + 1]))
            branch_summary['componentCounts'] = dict(branch_component_counts)
            result['branchSummaries'].append(branch_summary)

    bend_edges = [e for e in edges if e[1]['componentType'] == 'ELBO' and e[1]['endpoint'] == 0]
    sif_edges = [e for e in edges if e[1]['endpoint'] == 0 and e[1]['componentType'] in {'TEE', 'OLET'}]
    reducer_edges = [e for e in edges if e[1].get('alphaAngle') is not None and abs(e[1]['alphaAngle'] or 0.0) > 1e-9]
    rigid_edges = [e for e in edges if e[1].get('rigid') == 2 or (e[0].get('rigid') == 2 and e[1]['componentType'] == 'FLAN')]

    result['counts'] = {
        'pipes': pipe_count,
        'branches': branch_count,
        'nodesTotal': node_count,
        'positiveNodes': positive_count,
        'negativeNodes': negative_count,
        'zeroNodes': zero_count,
        'unitsPresent': units_present,
        'explicitRestraintNodes': restraint_nodes,
        'negativeNodeNumbers': dict(negative_numbers),
    }
    result['componentCounts'] = dict(component_counts)
    result['endpointCountsByComponent'] = {k: dict(v) for k, v in endpoint_counts.items()}
    result['nodeNumberSignCountsByComponent'] = {k: dict(v) for k, v in sign_counts.items()}
    result['rigidCountsByComponent'] = {k: dict(v) for k, v in rigid_counts.items()}
    result['ciiDetectable'] = {
        'edges': len(edges),
        'bendCandidates': len(bend_edges),
        'sifTeeCandidates': len(sif_edges),
        'reducerCandidates': len(reducer_edges),
        'rigidCandidates': len(rigid_edges),
        'explicitRestraintCandidates': restraint_nodes,
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description='Create PSI116 XML shape inventory JSON.')
    parser.add_argument('--xml', required=True, type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = analyze(args.xml)
    text = json.dumps(report, indent=2, sort_keys=True)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text, encoding='utf-8')
    print(text)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations
import csv, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
TSV = ROOT / 'docs' / 'Masters' / 'NPS_OD_BORE_SCHEDULE_MASTER.tsv'
BENCH = ROOT / 'Benchmarks' / 'PipeWallMaster' / 'pipe-wall-selection-benchmarks.json'
A106 = ROOT / 'Benchmarks' / 'PipeWallMaster' / 'a106-grb-b313-selection-benchmark.json'

S_SCHEDULES = {'5S', '10S', '40S', '80S'}

def standard_of(schedule):
    return 'ASME B36.19M' if schedule in S_SCHEDULES else 'ASME B36.10M'

def normalize_standard(value):
    key = ''.join(ch for ch in str(value).upper() if ch.isalnum())
    if key in {'ASMEB3610M','ASMEB3610','B3610M','B3610'}:
        return 'ASME B36.10M'
    if key in {'ASMEB3619M','ASMEB3619','B3619M','B3619'}:
        return 'ASME B36.19M'
    return str(value).strip().upper()

def nps_text(value):
    return str(float(value)).rstrip('0').rstrip('.')

def load_rows():
    with TSV.open(encoding='utf-8', newline='') as handle:
        source = list(csv.DictReader(handle, delimiter='\t'))
    schedule_cols = [c for c in source[0].keys() if c not in {'INCH','OD(mm)','BORE','OD(in)'}]
    out = []
    for row in source:
        for schedule in schedule_cols:
            raw = (row.get(schedule) or '').strip()
            if not raw:
                continue
            out.append({
                'dimensionStandard': standard_of(schedule),
                'nps': nps_text(row['INCH']),
                'dn': int(float(row['BORE'])),
                'schedule': schedule,
                'nominalWallMm': float(raw),
            })
    return out

def select(rows, query):
    std = normalize_standard(query['dimensionStandard'])
    nps = nps_text(query['nps']) if 'nps' in query else None
    dn = int(query['dn']) if 'dn' in query else None
    req = float(query['requiredNominalThicknessMm'])
    candidates = [r for r in rows if r['dimensionStandard'] == std
                  and (nps is None or r['nps'] == nps)
                  and (dn is None or r['dn'] == dn)]
    passing = [r for r in candidates if r['nominalWallMm'] + 1e-9 >= req]
    if not passing:
        return None
    wall = min(r['nominalWallMm'] for r in passing)
    equivalent = [r for r in passing if abs(r['nominalWallMm'] - wall) <= 1e-9]
    numeric = sorted(equivalent, key=lambda r: (0 if r['schedule'].rstrip('S').isdigit() else 1,
                                                float(r['schedule'].rstrip('S')) if r['schedule'].rstrip('S').isdigit() else 9999,
                                                r['schedule']))
    return wall, numeric[0]['schedule'], [r['schedule'] for r in numeric]

def main():
    rows = load_rows()
    bench = json.loads(BENCH.read_text(encoding='utf-8'))
    failures = []
    for case in bench['cases']:
        actual = select(rows, case['query'])
        expected = case['expected']
        if actual != (expected['nominalWallMm'], expected['schedule'], expected['equivalentSchedules']):
            failures.append((case['id'], actual, expected))
    a106 = json.loads(A106.read_text(encoding='utf-8'))
    for row in a106['rows']:
        actual = select(rows, {
            'dimensionStandard': a106['dimensionStandard'],
            'dn': row['dn'],
            'requiredNominalThicknessMm': row['requiredNominalThicknessMm'],
        })
        expected = row['expected']
        expected_tuple = (expected['selectedWallMm'], expected['schedule'], expected['equivalentSchedules'])
        if actual != expected_tuple:
            failures.append((f"A106-DN{row['dn']}", actual, expected_tuple))
    if failures:
        for item in failures:
            print('FAIL', item)
        return 1
    print(f"Pipe-wall independent generic benchmark passed: {len(bench['cases'])}/{len(bench['cases'])}")
    print(f"A106 Gr B B31.3-to-master selection benchmark passed: {len(a106['rows'])}/{len(a106['rows'])}")
    return 0

if __name__ == '__main__':
    raise SystemExit(main())

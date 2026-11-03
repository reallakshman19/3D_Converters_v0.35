#!/usr/bin/env python3
import json, pathlib, math
ROOT=pathlib.Path(__file__).resolve().parents[1]
master=json.loads((ROOT/'docs/Masters/b313-material-factor-master.json').read_text())
stress=master['factors']['S']
bench=json.loads((ROOT/'Benchmarks/B313MaterialFactors/a106-grb-full-pipeline-benchmark.json').read_text())
row=next(r for r in stress['records'] if r['materialId']=='CS-A106-B' and r['temperatureC']==0)
s=float(row['value'])*6.894757293168361
assert math.isclose(s,bench['expected']['S_MPa'],rel_tol=0,abs_tol=1e-12)
p=51.1*0.1; d=273.0; e=w=1.0; y=0.4; c=6.0
t=p*d/(2*(s*e*w+p*y)); tm=t+c; req=tm/0.875
assert math.isclose(req,bench['expected']['requiredNominalThicknessMm'],rel_tol=0,abs_tol=1e-12)
print('B31.3 material-factor independent A106 benchmark passed')

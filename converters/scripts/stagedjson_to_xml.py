#!/usr/bin/env python3
"""Convert staged hierarchy JSON to route-materialized PSI116 XML.

This upstream converter intentionally emits guard PIPE nodes around every
fitting/support center node so unchanged xml_to_cii.py can detect special
sections from branch order.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from psi116_upstream_common import convert_staged_json


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--node-start', type=int, default=10)
    p.add_argument('--node-step', type=int, default=10)
    p.add_argument('--source', default='AVEVA PSI')
    p.add_argument('--purpose', default='RMSS staged JSON conversion')
    p.add_argument('--title-line', default='RMSS StagedJSON Output')
    p.add_argument('--default-diameter', type=float, default=100.0)
    p.add_argument('--default-wall-thickness', type=float, default=0.01)
    p.add_argument('--default-insulation-thickness', type=float, default=0.0)
    p.add_argument('--default-corrosion-allowance', type=float, default=0.0)
    p.add_argument('--support-stiffness', default='')
    p.add_argument('--support-gap', default='')
    p.add_argument('--support-friction', default='0.3')
    p.add_argument('--guide-gap', default='')
    p.add_argument('--line-stop-gap', default='')
    p.add_argument('--limit-gap', default='')
    p.add_argument('--rest-gap', default='')
    p.add_argument('--anchor-gap', default='')
    p.add_argument('--support-pipe-axis', default='X')
    p.add_argument('--vertical-axis', default='Y')
    p.add_argument('--line-stop-direction', default='')
    p.add_argument('--limit-direction', default='')
    p.add_argument('--rest-direction', default='')
    return p


def main() -> None:
    args = build_parser().parse_args()
    convert_staged_json(args.input, args.output, args)


if __name__ == '__main__':
    main()

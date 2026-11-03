from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from .models import ResolverConfig
from .transaction import TransactionPolicy, apply_topofix_transaction, write_topofix_outputs


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Apply explicitly selected PSI116 topology fixes to an in-memory clone and emit a validated sidecar XML."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--stem")
    parser.add_argument("--action-id", action="append", default=[], help="Dry-run action ID to apply; repeat as needed.")
    parser.add_argument("--apply-all-safe", action="store_true", help="Explicitly apply every non-blocked action above the confidence threshold.")
    parser.add_argument("--minimum-confidence", type=float, default=0.95)
    parser.add_argument("--short-span-mm", type=float, default=ResolverConfig.short_span_threshold_mm)
    parser.add_argument("--connection-mm", type=float, default=ResolverConfig.connection_tolerance_mm)
    parser.add_argument("--coincidence-mm", type=float, default=ResolverConfig.exact_coincidence_tolerance_mm)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    config = ResolverConfig(
        short_span_threshold_mm=args.short_span_mm,
        connection_tolerance_mm=args.connection_mm,
        exact_coincidence_tolerance_mm=args.coincidence_mm,
    )
    policy = TransactionPolicy(
        selected_action_ids=tuple(args.action_id),
        apply_all_safe=args.apply_all_safe,
        minimum_confidence=args.minimum_confidence,
    )
    transaction = apply_topofix_transaction(args.input, policy=policy, config=config)
    transaction_path, validation_path, fixed_path = write_topofix_outputs(
        transaction, args.output_dir, stem=args.stem
    )
    print(f"PSI116 topology transaction committed: {transaction.committed}")
    print(transaction_path)
    print(validation_path)
    if fixed_path:
        print(fixed_path)
    else:
        for reason in transaction.reject_reasons:
            print(f"REJECTED: {reason}")
    return 0 if transaction.committed else 2


if __name__ == "__main__":
    raise SystemExit(main())

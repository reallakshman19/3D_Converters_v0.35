#!/usr/bin/env python3
"""Stamp the exact GitHub deployment identity into an already-built Pages tree.

The same function is exercised on a PR and during a main deployment. It does
not infer a release SHA from the test checkout or a browser rendering test.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path


def stamp(site: Path, commit: str, run_id: str, repository: str, *, main_only=False) -> Path:
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Release SHA must be full lowercase Git commit SHA")
    if not re.fullmatch(r"[1-9][0-9]*", run_id):
        raise ValueError("Release run ID must be a positive decimal integer")
    if repository != "reallakshman19/3D_Converters_v0.35":
        raise ValueError("Unexpected release repository")
    if main_only and os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise ValueError("Production Pages publishing must run from main")
    if not site.is_dir() or not (site / "index.html").is_file():
        raise ValueError("Already-built Pages runtime package not found")
    target = site / "release-identity.json"
    target.write_text(
        json.dumps({
            "schema": "xml-cii-production-deployment/v1",
            "repository": repository,
            "commitSha": commit,
            "workflowRunId": run_id,
        }, sort_keys=True) + "\n", encoding="utf-8",
    )
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-dir", required=True, type=Path)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--require-main", action="store_true")
    args = parser.parse_args()
    print("PAGES_RELEASE_MANIFEST=" + str(stamp(
        args.site_dir, args.commit, args.run_id, args.repository,
        main_only=args.require_main,
    )))

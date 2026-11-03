import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from lxml import etree as ET

from scripts.inputxml_compiler.publication import (
    CompilationView,
    FileOps,
    PublicationIntegrityError,
    PublicationInvariantError,
    PublicationLockError,
    PublicationStage,
    PublicationState,
    build_publication_plan,
    publish_result_bundle,
    verify_committed_bundle,
)
from scripts.inputxml_compiler.xml import _sha256, _xml_bytes


class FaultOps(FileOps):
    def __init__(self, *events):
        self.events = set(events)

    def checkpoint(self, event: str) -> None:
        if event in self.events:
            raise OSError(f"Injected failure: {event}")


class PublicationFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.mkdtemp()
        self.output_dir = Path(self.temp)

    def tearDown(self):
        shutil.rmtree(self.temp, ignore_errors=True)

    def view(
        self,
        *,
        stem="test-doc",
        status="PASS",
        candidate=True,
        resolver_kind=None,
        source_token="source-a",
    ):
        source_hash = _sha256(source_token.encode("utf-8"))
        canonical = ET.Element("root", source=source_token) if candidate else None
        canonical_hash = _sha256(_xml_bytes(canonical)) if canonical is not None else None
        if resolver_kind is None:
            resolver_kind = (
                "CANONICAL_CANDIDATE"
                if status == "PASS"
                else (
                    "BLOCKED_WITH_CANDIDATE"
                    if candidate
                    else "BLOCKED_NO_CANDIDATE"
                )
            )
        ledger = {
            "schema": "InputXmlCanonicalizationDecisionLedger.v1",
            "sourceHashSha256": source_hash,
            "canonicalHashSha256": canonical_hash,
            "dialect": "canonical-inputxml-v1",
            "status": status,
            "records": [],
            "diagnostics": [],
        }
        validation = {
            "schema": "InputXmlCanonicalValidation.v1",
            "dialect": "canonical-inputxml-v1",
            "status": status,
            "blockedAt": None if status == "PASS" else "XSD_GATE",
            "completedStages": ["INITIALIZED"],
            "resolverOutcome": {
                "profileId": "canonical-inputxml-v1",
                "adapterId": "canonical-inputxml-v1-direct",
                "outcomeKind": resolver_kind,
                "sourceAccountingStatus": "COMPLETE",
            },
            "orchestration": {
                "schema": "InputXmlCompilerOrchestration.v1",
                "currentStage": (
                    "PRODUCTION_ACCEPTED"
                    if status == "PASS"
                    else "CANONICAL_CANDIDATE_BUILT"
                ),
                "terminalStatus": status,
                "transitions": [],
            },
            "xsdErrors": [],
            "semanticErrors": [],
            "diagnostics": [],
        }
        return CompilationView.from_compiler_result(
            stem=stem,
            source_hash=source_hash,
            canonical=canonical,
            ledger=ledger,
            validation=validation,
        )


class TestPublicationState(unittest.TestCase):
    def test_legal_sequence(self):
        state = PublicationState()
        for stage in list(PublicationStage)[1:-1]:
            state.transition(stage)
        self.assertEqual(PublicationStage.COMMITTED, state.current_stage)

    def test_skip_and_terminal_rejected(self):
        state = PublicationState()
        with self.assertRaises(PublicationInvariantError):
            state.transition(PublicationStage.STAGED)
        state.transition(PublicationStage.LOCK_ACQUIRED)
        state.rollback()
        with self.assertRaises(PublicationInvariantError):
            state.transition(PublicationStage.STAGED)


class TestPublicationPlan(PublicationFixture):
    def test_three_bundle_kinds(self):
        cases = [
            (self.view(), "PASS_WITH_CANONICAL"),
            (
                self.view(status="BLOCKED", candidate=True),
                "BLOCKED_WITH_CANONICAL",
            ),
            (
                self.view(status="BLOCKED", candidate=False),
                "BLOCKED_NO_CANONICAL",
            ),
        ]
        for view, expected in cases:
            with self.subTest(expected=expected):
                plan = build_publication_plan(view, self.output_dir)
                payload = json.loads(plan.validation_bytes)
                self.assertEqual(expected, plan.bundle_kind)
                self.assertEqual(expected, payload["publication"]["bundleKind"])

    def test_pass_without_candidate_rejected(self):
        with self.assertRaises(PublicationInvariantError):
            self.view(status="PASS", candidate=False)

    def test_direct_canonical_block_without_returned_candidate_is_allowed(self):
        view = self.view(
            status="BLOCKED",
            candidate=False,
            resolver_kind="CANONICAL_CANDIDATE",
        )
        self.assertEqual(
            "BLOCKED_NO_CANONICAL",
            build_publication_plan(view, self.output_dir).bundle_kind,
        )

    def test_plan_metadata_is_deterministic_and_path_free(self):
        view = self.view()
        first = build_publication_plan(view, self.output_dir)
        second = build_publication_plan(view, self.output_dir)
        self.assertNotEqual(first.transaction_dir, second.transaction_dir)
        self.assertEqual(first.validation_bytes, second.validation_bytes)
        self.assertNotIn(str(first.transaction_dir).encode(), first.validation_bytes)


class TestPublicationProtocol(PublicationFixture):
    def test_stale_canonical_removed(self):
        publish_result_bundle(self.view(), self.output_dir)
        blocked = self.view(status="BLOCKED", candidate=False, source_token="source-b")
        publish_result_bundle(blocked, self.output_dir)
        canonical = self.output_dir / "test-doc.canonical.input.xml"
        self.assertFalse(canonical.exists())
        evidence = verify_committed_bundle(self.output_dir, "test-doc")
        self.assertEqual("BLOCKED_NO_CANONICAL", evidence["bundleKind"])

    def test_blocked_candidate_replaces_previous_pass(self):
        publish_result_bundle(self.view(), self.output_dir)
        blocked = self.view(status="BLOCKED", candidate=True, source_token="source-b")
        publish_result_bundle(blocked, self.output_dir)
        evidence = verify_committed_bundle(self.output_dir, "test-doc")
        self.assertEqual("BLOCKED_WITH_CANONICAL", evidence["bundleKind"])

    def test_repeated_publication_has_identical_committed_bytes(self):
        view = self.view()
        publish_result_bundle(view, self.output_dir)
        first = self._committed_bytes()
        publish_result_bundle(view, self.output_dir)
        self.assertEqual(first, self._committed_bytes())

    def test_same_stem_lock_blocks_but_other_stem_is_independent(self):
        plan = build_publication_plan(self.view(), self.output_dir)
        descriptor = os.open(plan.lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        try:
            with self.assertRaises(PublicationLockError):
                publish_result_bundle(self.view(), self.output_dir)
            publish_result_bundle(self.view(stem="other-doc"), self.output_dir)
        finally:
            os.close(descriptor)
            plan.lock_path.unlink()

    def test_unresolved_transaction_blocks_next_run(self):
        plan = build_publication_plan(self.view(), self.output_dir)
        unresolved = self.output_dir / f"{plan.transaction_prefix}orphaned"
        unresolved.mkdir()
        with self.assertRaises(PublicationIntegrityError):
            publish_result_bundle(self.view(), self.output_dir)
        self.assertTrue(unresolved.exists())
        self.assertFalse(plan.lock_path.exists())

    def test_cleanup_failure_preserves_committed_bundle(self):
        result = publish_result_bundle(
            self.view(),
            self.output_dir,
            ops=FaultOps("cleanup"),
        )
        self.assertTrue(result.cleanup_pending)
        verify_committed_bundle(self.output_dir, "test-doc")

    def test_precommit_failures_restore_old_bundle(self):
        publish_result_bundle(self.view(source_token="old"), self.output_dir)
        expected = self._committed_bytes()
        events = [
            "create_transaction",
            "write_canonical",
            "write_ledger",
            "write_validation",
            "verify_stage",
            "invalidate_validation",
            "backup_canonical",
            "backup_ledger",
            "install_canonical",
            "install_ledger",
            "install_validation",
            "fsync_directory",
        ]
        for event in events:
            with self.subTest(event=event):
                with self.assertRaises(Exception):
                    publish_result_bundle(
                        self.view(
                            status="BLOCKED",
                            candidate=True,
                            source_token=event,
                        ),
                        self.output_dir,
                        ops=FaultOps(event),
                    )
                self.assertEqual(expected, self._committed_bytes())
                verify_committed_bundle(self.output_dir, "test-doc")

    def test_rollback_failure_leaves_no_commit_marker(self):
        publish_result_bundle(self.view(source_token="old"), self.output_dir)
        with self.assertRaises(PublicationIntegrityError):
            publish_result_bundle(
                self.view(status="BLOCKED", candidate=True, source_token="new"),
                self.output_dir,
                ops=FaultOps("install_ledger", "rollback_restore_validation"),
            )
        marker = self.output_dir / "test-doc.canonical-validation.json"
        self.assertFalse(marker.exists())

    def _committed_bytes(self):
        return {
            path.name: path.read_bytes()
            for path in self.output_dir.iterdir()
            if not path.name.startswith(".")
        }


class TestCommittedBundleVerifier(PublicationFixture):
    def test_hash_tampering_fails_closed(self):
        publish_result_bundle(self.view(), self.output_dir)
        ledger = self.output_dir / "test-doc.canonicalization-ledger.json"
        ledger.write_bytes(ledger.read_bytes() + b" ")
        with self.assertRaises(PublicationIntegrityError):
            verify_committed_bundle(self.output_dir, "test-doc")

    def test_uncommitted_marker_rejected(self):
        publish_result_bundle(self.view(), self.output_dir)
        marker = self.output_dir / "test-doc.canonical-validation.json"
        payload = json.loads(marker.read_bytes())
        payload["publication"]["state"] = "PENDING"
        marker.write_text(json.dumps(payload), encoding="utf-8")
        with self.assertRaises(PublicationIntegrityError):
            verify_committed_bundle(self.output_dir, "test-doc")


if __name__ == "__main__":
    unittest.main()

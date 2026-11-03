#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.inputxml_compiler.compiler import compile_document
from scripts.inputxml_compiler.publication import (
    CompilationView,
    publish_result_bundle,
    verify_committed_bundle,
)
from scripts.inputxml_compiler.serialization import (
    SerializationPolicyError,
    canonical_decimal_text,
    serialize_canonical_xml,
    serialize_decision_ledger,
)
from scripts.inputxml_compiler.serialization_policy import (
    load_serialization_policy,
    serialization_policy_metadata,
    validate_serialization_policy,
)

CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
POLICY_PATH = (
    CONTRACTS
    / "compiler"
    / "inputxml-deterministic-serialization.json"
)
MINIMAL = (
    CONTRACTS
    / "golden"
    / "positive"
    / "minimal.canonical.input.xml"
)


def _compiler_paths() -> dict[str, Path]:
    return {
        "registry_path": CONTRACTS / "inputxml-dialect-registry.json",
        "adapter_registry_path": (
            CONTRACTS
            / "compiler"
            / "inputxml-compiler-adapters.json"
        ),
        "serialization_policy_path": POLICY_PATH,
        "alias_registry_path": (
            CONTRACTS
            / "catalogs"
            / "inputxml-alias-registry.json"
        ),
        "canonical_xsd_path": CONTRACTS / "inputxml-canonical-v1.xsd",
        "categorized_xsd_path": (
            CONTRACTS / "categorized-inputxml-v3.xsd"
        ),
        "semantic_rules_path": (
            CONTRACTS / "inputxml-semantic-rules-v1.sch"
        ),
    }


class DeterministicSerializationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.policy = load_serialization_policy(POLICY_PATH)

    def test_policy_is_closed_and_covers_runtime_identity_fields(self):
        metadata = serialization_policy_metadata(self.policy)
        self.assertEqual(
            "inputxml-deterministic-serialization-v1",
            metadata["policyId"],
        )
        order = self.policy["xml"]["attributeOrder"]
        self.assertIn("ID", order["PIPINGELEMENT"])
        self.assertIn("ISSUE_NO", order["PIPINGMODEL"])
        self.assertEqual(
            {"policyId", "policySchema", "policySha256"},
            set(metadata),
        )

    def test_policy_drift_and_duplicate_keys_reject(self):
        invalid = copy.deepcopy(self.policy)
        invalid["xml"]["attributeOrder"]["PIPINGELEMENT"].remove("ID")
        with self.assertRaises(SerializationPolicyError):
            validate_serialization_policy(invalid)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            raw = POLICY_PATH.read_text(encoding="utf-8")
            raw = raw.replace(
                '"policyId":',
                '"policyId": "duplicate",\n  "policyId":',
                1,
            )
            path.write_text(raw, encoding="utf-8")
            with self.assertRaisesRegex(
                SerializationPolicyError,
                "Duplicate JSON key",
            ):
                load_serialization_policy(path)

    def test_decimal_policy_is_fixed_point_and_locale_independent(self):
        self.assertEqual("0", canonical_decimal_text("-0.0000"))
        self.assertEqual("1000", canonical_decimal_text("1E+3"))
        self.assertEqual("12.34", canonical_decimal_text("12.3400"))
        with self.assertRaises(SerializationPolicyError):
            canonical_decimal_text("1,25")
        with self.assertRaises(SerializationPolicyError):
            canonical_decimal_text("NaN")

    def test_real_canonical_root_keeps_contract_namespaces_and_order(self):
        parser = ET.XMLParser(remove_blank_text=True)
        root = ET.fromstring(MINIMAL.read_bytes(), parser)
        data = serialize_canonical_xml(root, self.policy)
        self.assertIn(b'<CAESARII xmlns="COADE"', data)
        self.assertIn(b'<PIPINGMODEL xmlns=""', data)
        self.assertNotIn(b"http://www.coade.com/xml/CAESARII", data)
        self.assertLess(data.index(b' XML_TYPE="Input"'), data.index(b' VERSION="11'))
        self.assertLess(data.index(b' ID="E1"'), data.index(b' FROM_NODE="10"'))

    def test_numeric_normalization_does_not_reorder_elements(self):
        root = ET.Element(
            "{COADE}CAESARII",
            nsmap={None: "COADE", "ext": "urn:reallaksh19:inputxml:extension:v1"},
        )
        root.set("VERSION", "11.00")
        root.set("XML_TYPE", "Input")
        model = ET.SubElement(root, "PIPINGMODEL")
        for name, value in {
            "JOBNAME": "J", "TIME": "2026/07/20 00:00:00", "ISSUE_NO": "",
            "NUMELT": "2.0", "NUMNOZ": "0", "NOHGRS": "0", "NUMBEND": "0",
            "NUMRIGID": "0", "NUMEXPJNT": "0", "NUMREST": "0",
            "NUMFORCMNT": "0", "NUMUNFLOAD": "0", "NUMWIND": "0",
            "NUMELEOFF": "0", "NUMALLOW": "0", "NUMISECT": "0",
            "NORTH_X": "-0.0", "NORTH_Y": "1.000", "NORTH_Z": "0",
        }.items():
            model.set(name, value)
        for element_id, delta in (("E2", "2.000"), ("E1", "1.000")):
            element = ET.SubElement(model, "PIPINGELEMENT")
            values = {
                "ID": element_id, "FROM_NODE": "10", "TO_NODE": "20",
                "DELTA_X": delta, "DELTA_Y": "0", "DELTA_Z": "0",
                "DIAMETER": "10.000", "WALL_THICK": "1.00",
                "INSUL_THICK": "0", "CORR_ALLOW": "0",
                "MATERIAL_NUM": "1.0", "LINE": "L",
            }
            for name, value in reversed(list(values.items())):
                element.set(name, value)
        data = serialize_canonical_xml(root, self.policy)
        self.assertIn(b'NUMELT="2"', data)
        self.assertIn(b'NORTH_X="0"', data)
        self.assertIn(b'DELTA_X="2"', data)
        self.assertLess(data.index(b'ID="E2"'), data.index(b'ID="E1"'))

    def test_extension_attributes_sort_and_foreign_namespaces_reject(self):
        root = ET.fromstring(
            MINIMAL.read_bytes(),
            ET.XMLParser(remove_blank_text=True),
        )
        element = root.find("PIPINGMODEL/PIPINGELEMENT")
        self.assertIsNotNone(element)
        element.set("{urn:reallaksh19:inputxml:extension:v1}B", "2")
        element.set("{urn:reallaksh19:inputxml:extension:v1}A", "1")
        data = serialize_canonical_xml(root, self.policy)
        self.assertLess(data.index(b"ext:A"), data.index(b"ext:B"))
        element.set("{urn:foreign}X", "bad")
        with self.assertRaises(SerializationPolicyError):
            serialize_canonical_xml(root, self.policy)

    def test_json_is_mapping_order_independent_and_rejects_nan(self):
        left = {"z": {"b": 2, "a": 1}, "a": "é"}
        right = {"a": "é", "z": {"a": 1, "b": 2}}
        self.assertEqual(
            serialize_decision_ledger(left, self.policy),
            serialize_decision_ledger(right, self.policy),
        )
        self.assertIn(
            "é".encode("utf-8"),
            serialize_decision_ledger(left, self.policy),
        )
        with self.assertRaises(ValueError):
            serialize_decision_ledger({"bad": float("nan")}, self.policy)

    def test_hash_seed_subprocesses_produce_identical_canonical_hash(self):
        code = (
            "import hashlib;"
            "from pathlib import Path;"
            "from lxml import etree as ET;"
            "from scripts.inputxml_compiler.serialization_policy "
            "import load_serialization_policy;"
            "from scripts.inputxml_compiler.serialization "
            "import serialize_canonical_xml;"
            f"p=load_serialization_policy(Path({str(POLICY_PATH)!r}));"
            f"r=ET.fromstring(Path({str(MINIMAL)!r}).read_bytes(),"
            "ET.XMLParser(remove_blank_text=True));"
            "print(hashlib.sha256(serialize_canonical_xml(r,p)).hexdigest())"
        )
        values = []
        for seed in ("1", "2", "random"):
            env = dict(os.environ, PYTHONHASHSEED=seed)
            output = subprocess.check_output(
                [sys.executable, "-c", code],
                cwd=ROOT,
                env=env,
                text=True,
            )
            values.append(output.strip())
        self.assertEqual(1, len(set(values)))

    def test_contract_policy_blocks_before_source_parse(self):
        invalid = copy.deepcopy(self.policy)
        invalid["xml"]["attributeOrder"]["PIPINGELEMENT"].remove("ID")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            path.write_text(json.dumps(invalid), encoding="utf-8")
            paths = _compiler_paths()
            paths["serialization_policy_path"] = path
            canonical, ledger, validation = compile_document(
                b"<not-valid-xml",
                source_name="bad.xml",
                source_repository="test",
                source_path="test://bad.xml",
                producer="determinism-test",
                dialect_override="canonical-inputxml-v1",
                context={},
                **paths,
            )
        self.assertIsNone(canonical)
        self.assertEqual("BLOCKED", ledger["status"])
        self.assertEqual("CONTRACT_BUNDLE_GATE", validation["blockedAt"])
        codes = [item["code"] for item in validation["diagnostics"]]
        self.assertIn("CONTRACT_BUNDLE_INVALID", codes)
        self.assertNotIn("CANONICALIZATION_BLOCKED", codes)

    def test_compiler_publication_binds_policy_and_repeats_exact_bytes(self):
        source = MINIMAL.read_bytes()
        canonical, ledger, validation = compile_document(
            source,
            source_name=MINIMAL.name,
            source_repository="test",
            source_path=str(MINIMAL),
            producer="determinism-test",
            dialect_override="canonical-inputxml-v1",
            context={},
            **_compiler_paths(),
        )
        self.assertEqual("PASS", validation["status"])
        view = CompilationView.from_compiler_result(
            stem="minimal",
            source_hash=ledger["sourceHashSha256"],
            canonical=canonical,
            ledger=ledger,
            validation=validation,
            policy=self.policy,
        )
        snapshots = []
        for _ in range(2):
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory)
                publish_result_bundle(view, output)
                evidence = verify_committed_bundle(output, "minimal")
                self.assertEqual(
                    serialization_policy_metadata(self.policy),
                    evidence["serializationPolicy"],
                )
                snapshots.append(tuple(
                    (output / name).read_bytes()
                    for name in (
                        "minimal.canonical.input.xml",
                        "minimal.canonicalization-ledger.json",
                        "minimal.canonical-validation.json",
                    )
                ))
        self.assertEqual(snapshots[0], snapshots[1])


if __name__ == "__main__":
    unittest.main()

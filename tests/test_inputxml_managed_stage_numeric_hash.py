import json
import shutil
import subprocess
import unittest
from pathlib import Path

from scripts.inputxml_compiler.managed_stage_hashes import (
    canonical_json,
    canonical_number,
    deterministic_hash,
)

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "contracts/inputxml/v1/compiler/managed-stage-canonical-number-vectors.json"
JS_HASH = ROOT / "tabs/model-converters/converters/component-topology/topology-deterministic-hash.js"


class ManagedStageNumericHashTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads(VECTORS.read_text(encoding="utf-8"))

    def test_python_matches_every_ecmascript_numeric_vector(self):
        for row in self.contract["vectors"]:
            with self.subTest(vector=row["name"]):
                value = json.loads(row["source"])
                self.assertEqual(row["expected"], canonical_number(value))

    def test_python_and_javascript_share_exact_numeric_object_bytes_and_hash(self):
        expected = self.contract["objectVector"]
        value = self.object_value(expected["value"])
        self.assertEqual(expected["expectedCanonicalJson"], canonical_json(value))
        self.assertEqual(expected["expectedHash"], deterministic_hash(value))
        actual = self.run_javascript("""
const source = contract.objectVector.value;
const value = {
  zero: source.zero,
  negativeZero: -0,
  smallFixed: source.smallFixed,
  smallExponent: source.smallExponent,
  largeFixed: source.largeFixed,
  largeExponent: source.largeExponent,
  unsafeInteger: Number(source.unsafeIntegerSource),
  fraction: source.fraction,
};
return { json: canonicalJson(value), hash: deterministicHash(value) };
""")
        self.assertEqual(expected["expectedCanonicalJson"], actual["json"])
        self.assertEqual(expected["expectedHash"], actual["hash"])

    def test_cross_language_each_numeric_lexical_form(self):
        javascript = self.run_javascript("""
return contract.vectors.map((row) => JSON.stringify(JSON.parse(row.source)));
""")
        python = [canonical_number(json.loads(row["source"])) for row in self.contract["vectors"]]
        self.assertEqual(python, javascript)

    def test_string_vectors_share_exact_bytes_hash_and_rejection_policy(self):
        javascript = self.run_javascript("""
return contract.stringVectors.map((row) => {
  const value = JSON.parse(row.source);
  try {
    return { status: 'ACCEPT', json: canonicalJson(value), hash: deterministicHash(value) };
  } catch (error) {
    return { status: 'REJECT', message: error.message };
  }
});
""")
        for row, actual in zip(self.contract["stringVectors"], javascript):
            with self.subTest(vector=row["name"]):
                value = json.loads(row["source"])
                if row["policy"] == "REJECT":
                    with self.assertRaises(ValueError):
                        canonical_json(value)
                    self.assertEqual("REJECT", actual["status"])
                else:
                    self.assertEqual(row["expected"], canonical_json(value))
                    self.assertEqual(row["expectedHash"], deterministic_hash(value))
                    self.assertEqual("ACCEPT", actual["status"])
                    self.assertEqual(row["expected"], actual["json"])
                    self.assertEqual(row["expectedHash"], actual["hash"])

    def test_prototype_and_non_bmp_keys_are_preserved_cross_language(self):
        expected = self.contract["stringObjectVector"]
        value = expected["value"]
        self.assertEqual(expected["expectedCanonicalJson"], canonical_json(value))
        self.assertEqual(expected["expectedHash"], deterministic_hash(value))
        actual = self.run_javascript("""
const value = contract.stringObjectVector.value;
return {
  ownsPrototypeKey: Object.hasOwn(value, '__proto__'),
  json: canonicalJson(value),
  hash: deterministicHash(value),
};
""")
        self.assertTrue(actual["ownsPrototypeKey"])
        self.assertEqual(expected["expectedCanonicalJson"], actual["json"])
        self.assertEqual(expected["expectedHash"], actual["hash"])

    def run_javascript(self, body):
        node = shutil.which("node")
        self.assertIsNotNone(node)
        script = f"""
import fs from 'node:fs';
const {{ canonicalJson, deterministicHash }} = await import(process.argv[1]);
const contract = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const run = () => {{ {body} }};
process.stdout.write(JSON.stringify(run()));
"""
        completed = subprocess.run(
            [node, "--input-type=module", "-e", script, JS_HASH.as_uri(), str(VECTORS)],
            check=True,
            capture_output=True,
        )
        return json.loads(completed.stdout.decode("utf-8", errors="strict"))

    @staticmethod
    def object_value(source):
        return {
            "zero": source["zero"],
            "negativeZero": -0.0,
            "smallFixed": source["smallFixed"],
            "smallExponent": source["smallExponent"],
            "largeFixed": source["largeFixed"],
            "largeExponent": source["largeExponent"],
            "unsafeInteger": int(source["unsafeIntegerSource"]),
            "fraction": source["fraction"],
        }


if __name__ == "__main__":
    unittest.main()

import json
import shutil
import subprocess
import unittest
from pathlib import Path

from tests.managed_stage_test_support import build_intake

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = ROOT / "scripts/inputxml_compiler/node_managed_stage_bridge.mjs"


class ManagedStageBridgeRequestTests(unittest.TestCase):
    def setUp(self):
        self.node = shutil.which("node")
        self.assertIsNotNone(self.node)
        intake, _ = build_intake()
        self.request = intake.bridge_request()

    def test_duplicate_top_level_request_keys_are_rejected_before_construction(self):
        for field in ("profileId", "adapterId", "sourceHashSha256", "sourceContext"):
            with self.subTest(field=field):
                completed = self.run_raw(self.duplicate_field_json(self.request, field))
                self.assertNotEqual(0, completed.returncode)
                self.assertIn(
                    f'duplicate JSON key "{field}"',
                    completed.stderr.decode("utf-8", errors="replace"),
                )
                self.assertEqual(b"", completed.stdout)

    def test_nested_duplicate_context_key_is_rejected(self):
        context = self.request["sourceContext"]
        context_pairs = [
            json.dumps("version") + ":" + json.dumps(context["version"]),
            json.dumps("version") + ":" + json.dumps(context["version"]),
            *[
                json.dumps(key) + ":" + json.dumps(value, separators=(",", ":"))
                for key, value in context.items()
                if key != "version"
            ],
        ]
        raw = self.replace_field_json(
            self.request,
            "sourceContext",
            "{" + ",".join(context_pairs) + "}",
        )
        completed = self.run_raw(raw)
        self.assertNotEqual(0, completed.returncode)
        self.assertIn('duplicate JSON key "version"', completed.stderr.decode("utf-8"))

    def test_top_level_prototype_key_is_own_extra_field_not_inherited_authority(self):
        raw = self.insert_pair_json(
            self.request,
            '"__proto__":{"profileId":"managed-stage-json"}',
        )
        completed = self.run_raw(raw)
        self.assertNotEqual(0, completed.returncode)
        self.assertIn("extra=__proto__", completed.stderr.decode("utf-8"))

    def test_nested_prototype_keys_are_rejected_by_closed_context_contract(self):
        for key in ("__proto__", "prototype", "constructor"):
            with self.subTest(key=key):
                context = dict(self.request["sourceContext"])
                context[key] = {"jobName": "FORGED"}
                raw = self.replace_field_json(
                    self.request,
                    "sourceContext",
                    json.dumps(context, separators=(",", ":"), ensure_ascii=False),
                )
                completed = self.run_raw(raw)
                self.assertNotEqual(0, completed.returncode)
                self.assertIn(f"extra={key}", completed.stderr.decode("utf-8"))

    def test_unicode_non_json_whitespace_is_rejected(self):
        raw = json.dumps(self.request, separators=(",", ":"), ensure_ascii=False)
        raw = raw.replace("{", "{\u00a0", 1)
        completed = self.run_raw(raw)
        self.assertNotEqual(0, completed.returncode)
        self.assertIn("object key must be a string", completed.stderr.decode("utf-8"))

    def test_lone_surrogate_request_string_is_rejected(self):
        raw = self.replace_field_json(self.request, "sourceName", '"\\ud800"')
        completed = self.run_raw(raw)
        self.assertNotEqual(0, completed.returncode)
        self.assertIn("unpaired high surrogate", completed.stderr.decode("utf-8"))

    def run_raw(self, raw):
        return subprocess.run(
            [self.node, str(BRIDGE)],
            input=raw.encode("utf-8"),
            capture_output=True,
            check=False,
        )

    @staticmethod
    def duplicate_field_json(request, field):
        pairs = []
        for key, value in request.items():
            encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
            pairs.append(json.dumps(key) + ":" + encoded)
            if key == field:
                pairs.append(json.dumps(key) + ":" + encoded)
        return "{" + ",".join(pairs) + "}"

    @staticmethod
    def replace_field_json(request, field, replacement):
        pairs = []
        for key, value in request.items():
            encoded = replacement if key == field else json.dumps(
                value,
                separators=(",", ":"),
                ensure_ascii=False,
            )
            pairs.append(json.dumps(key) + ":" + encoded)
        return "{" + ",".join(pairs) + "}"

    @staticmethod
    def insert_pair_json(request, pair):
        raw = json.dumps(request, separators=(",", ":"), ensure_ascii=False)
        return "{" + pair + "," + raw[1:]


if __name__ == "__main__":
    unittest.main()

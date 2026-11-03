import copy
import unittest

from scripts.inputxml_compiler.base import CompileBlocked
from scripts.inputxml_compiler.managed_stage_engineering import verify_engineering_projection
from scripts.inputxml_compiler.managed_stage_entities import verify_source_entities_and_ports
from scripts.inputxml_compiler.managed_stage_hashes import deterministic_hash
from scripts.inputxml_compiler.managed_stage_identity import verify_result_identity
from scripts.inputxml_compiler.managed_stage_parity import verify_parity_and_metrics
from scripts.inputxml_compiler.managed_stage_topology import verify_topology_and_trace
from tests.managed_stage_test_support import raw_bridge_result


_HASH_FIELDS = {
    "canonicalTopology": "canonicalTopologyHash",
    "traceLedger": "topologyTraceLedgerHash",
    "parsedInputXmlTopology": "parsedInputXmlTopologyHash",
    "topologySvgScene": "svgSceneHash",
    "topologyParityReport": "topologyParityReportHash",
}


def restamp(result):
    canonical = result["canonicalTopology"]
    canonical["canonicalTopologyHash"] = deterministic_hash(
        canonical,
        hash_field="canonicalTopologyHash",
    )
    trace = result["traceLedger"]
    trace["canonicalTopologyHash"] = canonical["canonicalTopologyHash"]
    trace["topologyTraceLedgerHash"] = deterministic_hash(
        trace,
        hash_field="topologyTraceLedgerHash",
    )
    parsed = result["parsedInputXmlTopology"]
    parsed["canonicalTopologyHash"] = canonical["canonicalTopologyHash"]
    parsed["topologyTraceLedgerHash"] = trace["topologyTraceLedgerHash"]
    parsed["parsedInputXmlTopologyHash"] = deterministic_hash(
        parsed,
        hash_field="parsedInputXmlTopologyHash",
    )
    scene = result["topologySvgScene"]
    scene["canonicalTopologyHash"] = canonical["canonicalTopologyHash"]
    scene["topologyTraceLedgerHash"] = trace["topologyTraceLedgerHash"]
    scene["svgSceneHash"] = deterministic_hash(scene, hash_field="svgSceneHash")
    parity = result["topologyParityReport"]
    parity["canonicalTopologyHash"] = canonical["canonicalTopologyHash"]
    parity["topologyTraceLedgerHash"] = trace["topologyTraceLedgerHash"]
    parity["parsedInputXmlTopologyHash"] = parsed["parsedInputXmlTopologyHash"]
    parity["svgSceneHash"] = scene["svgSceneHash"]
    parity["topologyParityReportHash"] = deterministic_hash(
        parity,
        hash_field="topologyParityReportHash",
    )
    return result


class ManagedStageArtifactClosureTests(unittest.TestCase):
    def base(self):
        return raw_bridge_result()

    def source(self, intake, ledger, result):
        verify_result_identity(intake, result, ledger)
        return verify_source_entities_and_ports(intake, result, ledger)

    def topology(self, intake, ledger, result):
        source = self.source(intake, ledger, result)
        topology = verify_topology_and_trace(result, source, ledger)
        topology["branchCollectionPath"] = intake.branch_collection_path
        return source, topology

    def test_result_contract_rejects_missing_and_unknown_fields(self):
        for mutation in ("missing", "extra"):
            with self.subTest(mutation=mutation):
                intake, ledger, result = self.base()
                value = copy.deepcopy(result)
                if mutation == "missing":
                    value.pop("metrics")
                else:
                    value["hostPath"] = "/tmp/forbidden"
                with self.assertRaises(CompileBlocked):
                    verify_result_identity(intake, value, ledger)

    def test_profile_adapter_engine_and_source_hash_echo_exactly(self):
        fields = {
            "profileId": "other-profile",
            "adapterId": "other-adapter",
            "engineIdentity": "other-engine",
            "engineVersion": "9.9.9",
            "sourceHashSha256": "0" * 64,
        }
        for field, value in fields.items():
            with self.subTest(field=field):
                intake, ledger, result = self.base()
                result[field] = value
                with self.assertRaises(CompileBlocked):
                    verify_result_identity(intake, result, ledger)

    def test_source_identity_fields_close_across_artifacts(self):
        for field, value in (
            ("sourceFileId", "source-forged"),
            ("contentHash", "0" * 64),
            ("sourceName", "wrong.json"),
            ("sourceRevision", 2),
            ("sourceKind", "other"),
        ):
            with self.subTest(field=field):
                intake, ledger, result = self.base()
                result["canonicalTopology"]["sourceIdentity"][field] = value
                restamp(result)
                with self.assertRaises(CompileBlocked):
                    verify_result_identity(intake, result, ledger)

    def test_stale_artifact_hashes_block(self):
        for artifact, hash_field in _HASH_FIELDS.items():
            with self.subTest(artifact=artifact):
                intake, ledger, result = self.base()
                result[artifact][hash_field] = "fnv1a64:0000000000000000"
                with self.assertRaises(CompileBlocked):
                    verify_result_identity(intake, result, ledger)

    def test_duplicate_source_entity_id_blocks_before_indexing(self):
        intake, ledger, result = self.base()
        verify_result_identity(intake, result, ledger)
        result["sourceModel"]["entities"][1]["sourceEntityId"] = (
            result["sourceModel"]["entities"][0]["sourceEntityId"]
        )
        with self.assertRaises(CompileBlocked):
            verify_source_entities_and_ports(intake, result, ledger)

    def test_missing_and_duplicate_source_ports_block(self):
        for mutation in ("missing", "duplicate"):
            with self.subTest(mutation=mutation):
                intake, ledger, result = self.base()
                verify_result_identity(intake, result, ledger)
                if mutation == "missing":
                    result["sourcePorts"].pop()
                else:
                    result["sourcePorts"][1]["sourcePortId"] = (
                        result["sourcePorts"][0]["sourcePortId"]
                    )
                with self.assertRaises(CompileBlocked):
                    verify_source_entities_and_ports(intake, result, ledger)

    def test_duplicate_missing_and_extra_trace_records_block(self):
        for mutation in ("duplicate", "missing", "extra"):
            with self.subTest(mutation=mutation):
                intake, ledger, result = self.base()
                source = self.source(intake, ledger, result)
                records = result["traceLedger"]["records"]
                if mutation == "duplicate":
                    records.append(copy.deepcopy(records[0]))
                elif mutation == "missing":
                    records.pop()
                else:
                    extra = copy.deepcopy(records[0])
                    extra["sourceEntityId"] = "entity-extra"
                    records.append(extra)
                restamp(result)
                with self.assertRaises(CompileBlocked):
                    verify_topology_and_trace(result, source, ledger)

    def test_duplicate_node_and_edge_ids_block_after_rehash(self):
        for collection in ("nodes", "edges"):
            with self.subTest(collection=collection):
                intake, ledger, result = self.base()
                source = self.source(intake, ledger, result)
                rows = result["canonicalTopology"][collection]
                rows.append(copy.deepcopy(rows[0]))
                restamp(result)
                with self.assertRaises(CompileBlocked):
                    verify_topology_and_trace(result, source, ledger)

    def test_forged_successful_parity_report_blocks_after_rehash(self):
        intake, ledger, result = self.base()
        source, topology = self.topology(intake, ledger, result)
        projection = verify_engineering_projection(result, source, topology, ledger)
        result["topologyParityReport"]["summary"]["inputXmlElements"] += 1
        result["topologyParityReport"]["ok"] = True
        result["topologyParityReport"]["status"] = "PASS"
        restamp(result)
        with self.assertRaises(CompileBlocked):
            verify_parity_and_metrics(result, source, topology, projection, ledger)

    def test_corrected_hash_does_not_legalize_wrong_metric(self):
        intake, ledger, result = self.base()
        source, topology = self.topology(intake, ledger, result)
        projection = verify_engineering_projection(result, source, topology, ledger)
        result["metrics"]["canonical"]["edges"] += 1
        with self.assertRaises(CompileBlocked):
            verify_parity_and_metrics(result, source, topology, projection, ledger)


if __name__ == "__main__":
    unittest.main()

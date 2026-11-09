# Executed R1 foundation tests

Evidence class: real native Python existing converter, synthetic multi-branch input; the repository-native GLRD fixture is a separate smoke test.

No-edit replay: **PASS_EXACT_REPLAY**. Original SHA-256 de2308bf6b473c305203a65cbfd8d0ea8b2fc1113fea0d17291fa148be400f57, replay SHA-256 de2308bf6b473c305203a65cbfd8d0ea8b2fc1113fea0d17291fa148be400f57, byte lengths 23934/23934, differing bytes 0.

Lineage: {"elementMappings": {"AMBIGUOUS": 0, "CONFLICT": 0, "EXACT_UNIQUE": 8, "TRANSFORMED_WITH_LINEAGE": 3, "UNMATCHED": 0}, "engineInputBranches": 4, "engineInputNodes": 16, "events": {"PYTHON_NODE_RENUMBER": 1, "PYTHON_SHORT_NODE_DROP": 1}, "finalCiiElements": 11, "finalCiiRigids": 6, "finalNodes": {"count": 15, "generatedRenumberedWithLineage": 1, "originalIdentityVerified": 14, "unresolved": 0}, "originalEnrichedXmlBranches": 4, "originalEnrichedXmlNodes": 16, "otherAuxiliaryRecords": 0, "pythonPreprocessedBranches": 4, "pythonPreprocessedNodes": 16, "rigidOwnership": {"AMBIGUOUS": 1, "CONFLICT": 0, "EXACT_UNIQUE": 3, "TRANSFORMED_WITH_LINEAGE": 2, "UNMATCHED": 0}, "sharedRigidPointers": 0, "unreferencedRigidPointers": 0, "unresolvedSourceComponents": 1}

Tests executed (CI output):

\`\`\`text
test_L01_simple_rigid_unique (test_roundtrip_foundation.FourLevelLineageTests.test_L01_simple_rigid_unique) ... ok
test_L02_multi_elements_and_other_aux_references (test_roundtrip_foundation.FourLevelLineageTests.test_L02_multi_elements_and_other_aux_references) ... ok
test_L03_duplicate_node_numbers_are_branch_scoped (test_roundtrip_foundation.FourLevelLineageTests.test_L03_duplicate_node_numbers_are_branch_scoped) ... ok
test_L04_negative_node_renumber_with_observed_lineage (test_roundtrip_foundation.FourLevelLineageTests.test_L04_negative_node_renumber_with_observed_lineage) ... ok
test_L05_short_node_deletion_has_original_and_emitted_adjacency (test_roundtrip_foundation.FourLevelLineageTests.test_L05_short_node_deletion_has_original_and_emitted_adjacency) ... ok
test_L05b_nonpositive_original_nodes_omitted_with_full_lineage (test_roundtrip_foundation.FourLevelLineageTests.test_L05b_nonpositive_original_nodes_omitted_with_full_lineage)
No fixed generated-number pattern: actual parser retention is proof. ... ok
test_L06_shared_component_one_to_many_with_no_mass_allocation (test_roundtrip_foundation.FourLevelLineageTests.test_L06_shared_component_one_to_many_with_no_mass_allocation) ... ok
test_L07_no_cross_component_mass_on_shared_endpoints (test_roundtrip_foundation.FourLevelLineageTests.test_L07_no_cross_component_mass_on_shared_endpoints) ... ok
test_L08_shared_rigid_pointer_explicitly_visible_in_parser (test_roundtrip_foundation.FourLevelLineageTests.test_L08_shared_rigid_pointer_explicitly_visible_in_parser) ... ok
test_L09_invalid_auxiliary_pointer_rejected (test_roundtrip_foundation.FourLevelLineageTests.test_L09_invalid_auxiliary_pointer_rejected) ... ok
test_L10_TO_source_weight_selected_without_FROM_carry (test_roundtrip_foundation.FourLevelLineageTests.test_L10_TO_source_weight_selected_without_FROM_carry) ... ok
test_L11_actual_missing_wall_serializes_converter_derived_value (test_roundtrip_foundation.FourLevelLineageTests.test_L11_actual_missing_wall_serializes_converter_derived_value) ... ok
test_L11_wall_thickness_fallback_not_claimed_source_lossless (test_roundtrip_foundation.FourLevelLineageTests.test_L11_wall_thickness_fallback_not_claimed_source_lossless) ... ok
test_L12_element_indices_are_output_ordinals_not_source_ids (test_roundtrip_foundation.FourLevelLineageTests.test_L12_element_indices_are_output_ordinals_not_source_ids) ... ok
test_L12_swapped_element_blocks_do_not_preserve_output_ordinal_identity (test_roundtrip_foundation.FourLevelLineageTests.test_L12_swapped_element_blocks_do_not_preserve_output_ordinal_identity) ... ok
test_L13_same_geometry_in_distinct_branches_never_maps_across (test_roundtrip_foundation.FourLevelLineageTests.test_L13_same_geometry_in_distinct_branches_never_maps_across) ... ok
test_L17_observational_trace_does_not_change_converter_bytes (test_roundtrip_foundation.FourLevelLineageTests.test_L17_observational_trace_does_not_change_converter_bytes) ... ok
test_every_final_element_and_rigid_classified (test_roundtrip_foundation.FourLevelLineageTests.test_every_final_element_and_rigid_classified) ... ok
test_lineage_rejects_stale_snapshot (test_roundtrip_foundation.FourLevelLineageTests.test_lineage_rejects_stale_snapshot) ... ok
test_missing_component_ref_does_not_erase_verified_node_lineage (test_roundtrip_foundation.FourLevelLineageTests.test_missing_component_ref_does_not_erase_verified_node_lineage)
Source identity remains resolvable without claiming physical mass. ... ok
test_repo_native_no_silent_writer_source_to_owner_promotion (test_roundtrip_foundation.FourLevelLineageTests.test_repo_native_no_silent_writer_source_to_owner_promotion)
Verify owner field is empty whenever physical owner is unresolved. ... ok
test_repo_native_omitted_negative_source_node_classified (test_roundtrip_foundation.FourLevelLineageTests.test_repo_native_omitted_negative_source_node_classified)
Repository-native smoke must improve only with real omission proof. ... ok
test_repository_native_lineage_is_classified_not_fabricated (test_roundtrip_foundation.FourLevelLineageTests.test_repository_native_lineage_is_classified_not_fabricated) ... ok
test_L14_stale_source_refuses (test_roundtrip_foundation.SnapshotReplayTests.test_L14_stale_source_refuses) ... ok
test_L15_missing_config_or_unattested_completeness_refuses (test_roundtrip_foundation.SnapshotReplayTests.test_L15_missing_config_or_unattested_completeness_refuses) ... ok
test_L16_exact_real_converter_replay (test_roundtrip_foundation.SnapshotReplayTests.test_L16_exact_real_converter_replay) ... ok
test_code_identity_mutation_refuses (test_roundtrip_foundation.SnapshotReplayTests.test_code_identity_mutation_refuses) ... ok
test_effective_config_mismatch_refuses (test_roundtrip_foundation.SnapshotReplayTests.test_effective_config_mismatch_refuses) ... ok
test_invalid_output_cii_cannot_pass_structure (test_roundtrip_foundation.SnapshotReplayTests.test_invalid_output_cii_cannot_pass_structure) ... ok
test_missing_asset_refuses (test_roundtrip_foundation.SnapshotReplayTests.test_missing_asset_refuses) ... ok
test_modified_original_cii_refuses (test_roundtrip_foundation.SnapshotReplayTests.test_modified_original_cii_refuses) ... ok
test_multi_element_and_rigid_control_pointer_counts (test_roundtrip_foundation.SnapshotReplayTests.test_multi_element_and_rigid_control_pointer_counts) ... ok
test_repository_native_glrd_real_converter_smoke (test_roundtrip_foundation.SnapshotReplayTests.test_repository_native_glrd_real_converter_smoke) ... ok
test_snapshot_invocation_is_exact_no_implicit_flags (test_roundtrip_foundation.SnapshotReplayTests.test_snapshot_invocation_is_exact_no_implicit_flags) ... ok
test_synthetic_433_144_real_converter_scale_no_authentic_claim (test_roundtrip_foundation.SnapshotReplayTests.test_synthetic_433_144_real_converter_scale_no_authentic_claim) ... ok
test_unqualified_external_master_refuses (test_roundtrip_foundation.SnapshotReplayTests.test_unqualified_external_master_refuses) ... ok
test_wrong_weight_scale_or_split_setting_refuses (test_roundtrip_foundation.SnapshotReplayTests.test_wrong_weight_scale_or_split_setting_refuses) ... ok

----------------------------------------------------------------------
Ran 37 tests in 5.902s

OK

\`\`\`

**NOT_RUN:** Authentic Owner 433/144 GLRD, historical independent CII, browser/Pyodide parity, large-model performance, pre-JS original-to-engine-input lineage, direct mass approval.

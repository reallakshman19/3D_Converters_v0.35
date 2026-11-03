# InputXML to CII 2019 Configured Benchmark Validation

**Commit SHA:** d1f23c12498d8772060f73a997395cb8821abc0c (Benchmark generated at d1f23c12498d8772060f73a997395cb8821abc0c, still present and syntax-clean on current main b5ef23774f05175b5154816b0cb7f913ca3f4975)

## Benchmark Command Executed
```bash
python viewer/converters/scripts/inputxml_to_cii2019_workflow.py \
  --input "Benchmarks/INPUT XML to CII 2019/BM_CII/BM_CII_INPUT.XML" \
  --benchmark "Benchmarks/INPUT XML to CII 2019/BM_CII/BM_CII[Benchmark].CII" \
  --output "Benchmarks/INPUT XML to CII 2019/BM_CII/AutojsongeneratedCII_BM_CII_INPUT.cii" \
  --config-output "Benchmarks/INPUT XML to CII 2019/BM_CII/AutojsongeneratedCII_BM_CII_INPUT.layout_config.generated.json"
```

## Syntax Check Command Executed
```bash
python viewer/converters/scripts/cii_syntax_check_2019.py \
  --input "Benchmarks/INPUT XML to CII 2019/BM_CII/AutojsongeneratedCII_BM_CII_INPUT.cii" \
  --output "Benchmarks/INPUT XML to CII 2019/BM_CII/AutojsongeneratedCII_BM_CII_INPUT.syntax_report.json"
```

## Generated Artifacts
- **Generated CII**: `Benchmarks/INPUT XML to CII 2019/BM_CII/AutojsongeneratedCII_BM_CII_INPUT.cii`
- **Generated Config JSON**: `Benchmarks/INPUT XML to CII 2019/BM_CII/AutojsongeneratedCII_BM_CII_INPUT.layout_config.generated.json`
- **Syntax Report**: `Benchmarks/INPUT XML to CII 2019/BM_CII/AutojsongeneratedCII_BM_CII_INPUT.syntax_report.json`

## Validation Results

| Check | Result |
|---|---|
| ok | true |
| errors | [] |
| sectionsFound | Includes MISCEL_1 |
| MISCEL_1 position | After EQUIPMNT, before UNITS |
| metrics.hangers | 1 |
| metrics.equipmnt | 0 |
| derivedBlockCounts.EQUIPMNT.rows | 0 |
| cii_syntax_final_smoke_report.json ok | true |

**Note:** The output from the `--strict` hardener script was *not* required because the initial benchmark-specific generation (`inputxml_to_cii2019_workflow.py`) already produced a clean CII 2019 file with proper MISCEL_1 bounds.

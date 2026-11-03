import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from nps_bore_master import (
    load_nps_master,
    parse_nps_range,
    parse_nps_scalar,
    range_matches_nps,
    resolve_bore_mm,
    resolve_od_mm,
    resolve_schedule_thickness_mm,
)


def test_master_table_contains_project_nominal_mapping_not_25_4_approximation():
    rows = load_nps_master()
    assert len(rows) == 42
    assert resolve_bore_mm('1"', rows) == 25
    assert resolve_od_mm('1"', rows) == 33
    assert resolve_bore_mm('3/4', rows) == 20
    assert resolve_od_mm('3/4', rows) == 27
    assert resolve_schedule_thickness_mm('10"', '120', rows) == 21.4376


def test_fraction_and_mixed_fraction_inputs():
    rows = load_nps_master()
    assert parse_nps_scalar('1/2') == 0.5
    assert parse_nps_scalar('3/4') == 0.75
    assert parse_nps_scalar('1-1/2') == 1.5
    assert parse_nps_scalar('1 1/2') == 1.5
    assert parse_nps_scalar('1.1/2') == 1.5
    assert parse_nps_scalar('0.75') == 0.75
    assert parse_nps_scalar('1.5') == 1.5
    assert resolve_bore_mm('1-1/2', rows) == 40
    assert resolve_bore_mm('1 1/2', rows) == 40
    assert resolve_bore_mm('1.1/2', rows) == 40


def test_range_inputs_and_ambiguous_slash_context():
    assert parse_nps_range('4-6').low == 4
    assert parse_nps_range('4-6').high == 6
    assert parse_nps_range('4"-6"').low == 4
    assert parse_nps_range('4-6"').high == 6
    assert parse_nps_range('4/6"') is None
    assert parse_nps_range('4/6"', slash_range_context=True).low == 4
    assert parse_nps_range('4/6"', slash_range_context=True).high == 6
    assert range_matches_nps('4-6', 5)
    assert range_matches_nps('4"-6"', 4)
    assert range_matches_nps('4/6"', 6, slash_range_context=True)
    assert not range_matches_nps('4/6"', 6, slash_range_context=False)


def test_temperature_range_policy_is_not_bore_fraction_policy():
    # Demonstrates why generic first-number extraction is unsafe: 50-60 is a
    # process range, while 1-1/2 is a mixed fraction. The bore parser must keep
    # these grammars separate.
    assert parse_nps_scalar('50-60 Deg C') is None
    assert parse_nps_range('50-60 Deg C') is None

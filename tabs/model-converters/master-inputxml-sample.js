/**
 * Master InputXML template — a single downloadable reference file for the
 * "InputXML -> CII(2019)" converter.
 *
 * Any tool that needs to feed the InputXML -> CII(2019) converter (this
 * app's own "Enriched InputXML" export, "StagedJSON -> InputXML", "PDF ->
 * InputXML (CII14)", or a completely external system) should shape its
 * output to match the attribute names and element nesting shown here. The
 * file is a normal InputXML document with a large leading XML comment that
 * documents every attribute group the converter engine
 * (converters/scripts/inputxml_to_cii2019.py) understands, so it can be
 * downloaded, opened, and used as both documentation and a copy/paste
 * starting point.
 *
 * Keep this file in sync with converters/scripts/inputxml_to_cii2019.py.
 * If you add a field the engine reads, document it here too.
 */

export const MASTER_INPUTXML_FILE_NAME = 'Master_InputXML_Template.xml';

export const MASTER_INPUTXML_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!--
====================================================================
 MASTER INPUTXML TEMPLATE - InputXML -> CII(2019) converter
====================================================================

WHAT THIS FILE IS
~~~~~~~~~~~~~~~~~~
A worked, fully-commented reference copy of the "Input XML" dialect that
converters/scripts/inputxml_to_cii2019.py reads. It is the canonical target
format: any pipeline that produces InputXML for this converter (this app's
own "Enriched InputXML via XML->CII(2019)", "StagedJSON -> InputXML", and
"PDF -> InputXML (CII14)" outputs, or a third-party tool) should converge on
this attribute naming and element structure.

This is documentation, not a file you run as-is: replace the sample values
with your model's real data, keep the element/attribute names, and remove
any elements/attributes you do not need (missing = converter falls back to
its "Advanced options" defaults, or 0.0 where noted below).

HOW TO USE THIS FILE
~~~~~~~~~~~~~~~~~~~~~
1. Keep the root <CAESARII XML_TYPE="Input" VERSION="2019"> element and the
   <PIPINGMODEL> wrapper.
2. Add one <PIPINGELEMENT> per pipe segment / component run, in any node
   order (the converter builds the model from FROM_NODE/TO_NODE pairs, not
   from element order in the file).
3. Attach child elements (BEND, RIGID, RESTRAINT, SIF, HANGER, nozzle
   blocks) to the <PIPINGELEMENT> whose TO_NODE is where that item sits,
   matching how CAESAR II itself exports Input XML.
4. A reducer does NOT need its own element/tag: the converter detects one
   automatically whenever two adjacent, physically-connected elements
   (current.TO_NODE == following.FROM_NODE) have different DIAMETER values.
   The reducer half-angle is computed from that segment's DELTA_X/DELTA_Y/
   DELTA_Z geometry and the diameter change - you do not need to supply an
   angle. (See "REDUCER ANGLE" note below for how to override it.)
5. If your tool spells an attribute slightly differently than shown here
   (e.g. "PRESSURE1" instead of "PRESSURE_C1", or "TEMP_EXPC1" instead of
   "TEMP_EXP_C1"), you do NOT need to change your tool or this converter:
   add the variant spelling to converters/inputxml-field-adapter.js
   (INPUTXML_ATTRIBUTE_ALIASES). That adapter rewrites known variant names
   to the canonical ones shown in this file before the Python engine ever
   sees them, so the engine itself never needs to change.

SENTINEL / MISSING VALUES
~~~~~~~~~~~~~~~~~~~~~~~~~~
Real CAESAR II exports use -1.010100 as a "not applicable / inherit
previous element's value" sentinel for many PIPINGELEMENT attributes
(DIAMETER, WALL_THICK, INSUL_THICK, CORR_ALLOW, temperature/pressure cases,
densities, HYDRO_PRESSURE). The converter treats a missing attribute the
same way: it carries forward the last real value seen for that field along
the branch, or falls back to the matching "Advanced options" default
(Default Diameter, Default Wall Thickness, Default Temperature1/2/3, etc.)
if none has been seen yet.

REDUCER ANGLE ("Advanced options > Infer Reducer Angle From Geometry")
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Geometry data already present in the file (DELTA_X/Y/Z + the diameters on
either side of a detected reducer) is now used automatically to compute a
real half-angle, whenever that geometry is present and the "Default Reducer
Angle" option has been left at its default of 0. If you explicitly set a
non-zero "Default Reducer Angle" in Advanced options, that value is honored
as your deliberate override even with the checkbox unchecked. Ticking
"Infer Reducer Angle From Geometry" forces geometry to win even over a
configured non-zero default.

====================================================================
 ATTRIBUTE REFERENCE (grouped by element)
====================================================================

<CAESARII XML_TYPE="Input" VERSION="2019">   Root. VERSION is read as header metadata.
  DateTime attribute (root or header block, tool-dependent)          Header DateTime
  Source / UserName / Purpose / ProjectName / MDBName (header block) Header Source / UserName / Purpose / ProjectName / MDBName
    * These map 1:1 to the "Header ..." Advanced options fields and are
       purely descriptive text carried into the CII header block.

<PIPINGMODEL>                                  One piping model per file.

  <PIPINGELEMENT ...>                          One element/segment per FROM_NODE->TO_NODE pair.
    FROM_NODE / TO_NODE          (required)    Node numbers this segment connects.
    DELTA_X / DELTA_Y / DELTA_Z  (required)    Segment vector, model length units.
    DIAMETER                                   Outside diameter. Carried forward when omitted.
    WALL_THICK                                 Wall thickness. Carried forward when omitted.
    INSUL_THICK                                Insulation thickness. Carried forward when omitted.
    CORR_ALLOW                                 Corrosion allowance. Carried forward when omitted.
    TEMP_EXP_C1 .. TEMP_EXP_C9                 Nine thermal cases (design/operating/etc.), same units as AmbientTemperature.
    PRESSURE_C1 .. PRESSURE_C9                 Nine pressure cases, one per thermal case above.
    HYDRO_PRESSURE                             Hydrotest pressure for this segment.
    INSUL_DENSITY                              Insulation density.
    FLUID_DENSITY                              Contained fluid density / specific gravity.
    MATERIAL_NUM                               CII material table index (integer, e.g. 106 for A106 Gr B).
    FROM_NAME / TO_NAME                        Optional human-readable node labels (NODENAME section).

    <BEND ...>                                 At most one per element; marks TO_NODE as a bend vertex.
      RADIUS, TYPE, NUM_MITER, FITTINGTHICKNESS, KFACTOR
      ANGLE1/NODE1, ANGLE2/NODE2, ANGLE3/NODE3  Up to 3 tangent-intersection angle/node pairs.

    <RIGID ...>                                Rigid element (valve/flange/component) weight.
      WEIGHT

    <RESTRAINT ...>                            Repeatable, up to 6 per element (one CII RESTRANT block).
      NODE, NUM (slot 1-6), TYPE (CII restraint type code)
      STIFFNESS, GAP, FRIC_COEF (alias: MU already handled natively)
      CNODE (connecting/reference node for two-node restraints)
      XCOSINE / YCOSINE / ZCOSINE                Direction cosines for skewed restraints.
      TAG, GUID                                  Optional identifiers, passed through to diagnostics.

    <SIF ...>                                  Marks TO_NODE as carrying a stress intensification factor.
      NODE

    <HANGER ...>                               Spring hanger definition at TO_NODE.
      NODE, STIFFNESS, LOAD_VAR, OPERATING_LOAD, RIGID_SUP, AVAIL_SPACE,
      COLD_LOAD, HOT_LOAD, MAX_TRAVEL, HARDWARE_WEIGHT, CONST_EFF_LOAD,
      MULTI_LC, FREEANCHOR1, FREEANCHOR2, DOFTYPE1, NUM_HGR, HGR_TABLE,
      SHORT_RANGE, CNODE, TAG, GUID

    <WRC_297_NOZZLE ...> / <API650_NOZZLE ...> / <PD5500_NOZZLE ...> / <CUSTOM_NOZZLE ...>
                                                Nozzle/vessel flexibility block, any nesting depth.
      NOZZLE_NODE (or NOZ_NODE/NODE/NODE1), VESSEL_NODE (or TANK_NODE/NODE2)
      NOZ_OD/NOZZLE_OD/OD, NOZ_WT/NOZZLE_WT/WT, TANK_OD/VESSEL_OD, TANK_WT/VESSEL_WT
      REINFORCE, NOZ_HEIGHT/NOZZLE_HEIGHT, FLUID_HEIGHT, DISP_VECTOR, FLUID_SG,
      THERM_EXP_COEFF, DELTAT/DELTA_T, EMOD
      (API650_NOZZLE and the generic WRC/PD5500/CUSTOM family use slightly
      different field layouts internally - see inputxml_to_cii2019.py's
      _build_vflex_values_from_attributes for the exact slot mapping.)

====================================================================
 THREE WAYS THIS FORMAT REACHES THE CONVERTER
====================================================================
1. Enriched InputXML via XML->CII(2019): the standalone XML->CII(2019)
   workflow can export an "enriched" InputXML debug file that already
   matches this schema (see xml_to_cii2019_master_addon.py / SOURCE=
   "XML->CII enriched InputXML debug export" marker on its root).
2. StagedJSON -> InputXML: converters/scripts/stagedjson_to_inputxml.py
   builds this schema directly from a Staged JSON model.
3. PDF -> InputXML (CII14): converters/scripts/pdf_to_inputxml_cii14.py
   extracts this schema from a CAESAR II input-echo PDF.
   All three should be checked against this reference when troubleshooting
   a field that isn't showing up in the generated CII file.
====================================================================
-->
<CAESARII XML_TYPE="Input" VERSION="2019">
  <PIPINGMODEL DATETIME="13:40:45 6 May 2026" SOURCE="Master InputXML Template" USERNAME="TEMPLATE" PURPOSE="Reference template" PROJECTNAME="TEMPLATE" MDBNAME="/TEMPLATE">

    <!-- Straight run 10->20: full core attribute set, one thermal/pressure case populated -->
    <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" FROM_NAME="PS-10" TO_NAME="PS-20"
      DELTA_X="1500.000000" DELTA_Y="0.000000" DELTA_Z="0.000000"
      DIAMETER="114.300000" WALL_THICK="6.020000" INSUL_THICK="0.000000" CORR_ALLOW="1.500000"
      TEMP_EXP_C1="80.000000" TEMP_EXP_C2="-1.010100" TEMP_EXP_C3="-1.010100" TEMP_EXP_C4="-1.010100"
      TEMP_EXP_C5="-1.010100" TEMP_EXP_C6="-1.010100" TEMP_EXP_C7="-1.010100" TEMP_EXP_C8="-1.010100" TEMP_EXP_C9="-1.010100"
      PRESSURE_C1="1.500000" PRESSURE_C2="-1.010100" PRESSURE_C3="-1.010100" PRESSURE_C4="-1.010100"
      PRESSURE_C5="-1.010100" PRESSURE_C6="-1.010100" PRESSURE_C7="-1.010100" PRESSURE_C8="-1.010100" PRESSURE_C9="-1.010100"
      HYDRO_PRESSURE="2.250000" INSUL_DENSITY="-1.010100" FLUID_DENSITY="0.001000" MATERIAL_NUM="106">
      <RESTRAINT NODE="10" NUM="1" TYPE="1" STIFFNESS="-1.010100" GAP="0.000000" FRIC_COEF="0.300000" TAG="A1" GUID=""/>
    </PIPINGELEMENT>

    <!-- Reducer example: adjacent element with a different DIAMETER than the
         one above. No angle attribute is supplied - the converter computes
         it from this segment's geometry and the 114.3 -> 88.9 diameter step. -->
    <PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="1000.000000" DELTA_Y="0.000000" DELTA_Z="0.000000"
      DIAMETER="88.900000" WALL_THICK="5.490000"/>

    <!-- Bend + rigid + SIF example -->
    <PIPINGELEMENT FROM_NODE="30" TO_NODE="40" DELTA_X="0.000000" DELTA_Y="1000.000000" DELTA_Z="0.000000" DIAMETER="88.900000">
      <BEND RADIUS="133.350000" TYPE="1" ANGLE1="90.000000" NODE1="35" NUM_MITER="0.000000" FITTINGTHICKNESS="-1.010100" KFACTOR="-1.010100"/>
      <SIF NODE="40"/>
    </PIPINGELEMENT>

    <PIPINGELEMENT FROM_NODE="40" TO_NODE="50" DELTA_X="500.000000" DELTA_Y="0.000000" DELTA_Z="0.000000" DIAMETER="88.900000">
      <RIGID WEIGHT="12.500000"/>
    </PIPINGELEMENT>

    <!-- Hanger example -->
    <PIPINGELEMENT FROM_NODE="50" TO_NODE="60" DELTA_X="0.000000" DELTA_Y="0.000000" DELTA_Z="500.000000" DIAMETER="88.900000">
      <HANGER NODE="60" STIFFNESS="875.000000" LOAD_VAR="10.000000" OPERATING_LOAD="450.000000" COLD_LOAD="460.000000" HOT_LOAD="440.000000" MAX_TRAVEL="25.000000" NUM_HGR="1.000000" TAG="H1" GUID=""/>
    </PIPINGELEMENT>

    <!-- Nozzle/vessel example (WRC-297). Kept commented out of the runnable
         sample: the converter currently does not support combining a
         HANGER (used above) with nozzle VFLEX data in the same file (see
         cii2019_hanger_miscel_control.py). Use nozzle blocks and hangers in
         separate files, or omit the HANGER above, until that limitation is
         lifted. The attribute names below are still current and correct.
    <PIPINGELEMENT FROM_NODE="60" TO_NODE="70" DELTA_X="500.000000" DELTA_Y="0.000000" DELTA_Z="0.000000" DIAMETER="88.900000">
      <WRC_297_NOZZLE NOZZLE_NODE="70" VESSEL_NODE="9070" NOZ_OD="88.900000" NOZ_WT="5.490000" TANK_OD="2000.000000" TANK_WT="12.000000" REINFORCE="0.000000" FLUID_SG="1.000000"/>
    </PIPINGELEMENT>
    -->

  </PIPINGMODEL>
</CAESARII>
`;

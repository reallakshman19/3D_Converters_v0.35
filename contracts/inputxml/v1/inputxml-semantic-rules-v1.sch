<?xml version="1.0" encoding="UTF-8"?>
<sch:schema xmlns:sch="http://purl.oclc.org/dsdl/schematron"
            queryBinding="xslt">
  <sch:title>Canonical InputXML v1 semantic rules</sch:title>
  <sch:ns prefix="coade" uri="COADE"/>
  <sch:ns prefix="ext" uri="urn:reallaksh19:inputxml:extension:v1"/>

  <sch:pattern id="document-shape">
    <sch:rule context="/coade:CAESARII">
      <sch:assert test="@XML_TYPE = 'Input'">CAESARII XML_TYPE must be Input.</sch:assert>
      <sch:assert test="count(PIPINGMODEL) = 1">Exactly one direct PIPINGMODEL is required.</sch:assert>
    </sch:rule>
    <sch:rule context="/coade:CAESARII/PIPINGMODEL">
      <sch:assert test="count(PIPINGELEMENT) &gt; 0">At least one PIPINGELEMENT is required.</sch:assert>
      <sch:assert test="number(@NUMELT) = count(PIPINGELEMENT)">NUMELT must equal PIPINGELEMENT count.</sch:assert>
      <sch:assert test="number(@NUMNOZ) = count(WRC_297_NOZZLE | API650_NOZZLE | PD5500_NOZZLE | CUSTOM_NOZZLE)">NUMNOZ must equal nozzle record count.</sch:assert>
      <sch:assert test="number(@NOHGRS) = count(PIPINGELEMENT/HANGER)">NOHGRS must equal active HANGER count.</sch:assert>
      <sch:assert test="number(@NUMBEND) = count(PIPINGELEMENT/BEND)">NUMBEND must equal BEND count.</sch:assert>
      <sch:assert test="number(@NUMRIGID) = count(PIPINGELEMENT/RIGID)">NUMRIGID must equal RIGID count.</sch:assert>
      <sch:assert test="number(@NUMREST) = count(PIPINGELEMENT[RESTRAINT])">NUMREST must equal elements owning restraints.</sch:assert>
      <sch:assert test="number(@NUMISECT) = count(PIPINGELEMENT[SIF])">NUMISECT must equal elements owning SIF records.</sch:assert>
      <sch:assert test="number(@NUMEXPJNT) = 0 and number(@NUMFORCMNT) = 0 and number(@NUMUNFLOAD) = 0 and number(@NUMWIND) = 0 and number(@NUMELEOFF) = 0 and number(@NUMALLOW) = 0">Unsupported auxiliary CONTROL counts must be zero.</sch:assert>
      <sch:assert test="(number(@NORTH_X) * number(@NORTH_X) + number(@NORTH_Y) * number(@NORTH_Y) + number(@NORTH_Z) * number(@NORTH_Z)) &gt; 0.9 and (number(@NORTH_X) * number(@NORTH_X) + number(@NORTH_Y) * number(@NORTH_Y) + number(@NORTH_Z) * number(@NORTH_Z)) &lt; 1.1">NORTH vector must be approximately unit length.</sch:assert>
    </sch:rule>
  </sch:pattern>

  <sch:pattern id="element-topology">
    <sch:rule context="/coade:CAESARII/PIPINGMODEL/PIPINGELEMENT">
      <sch:assert test="number(@FROM_NODE) != number(@TO_NODE)">FROM_NODE and TO_NODE must differ.</sch:assert>
      <sch:assert test="number(@DELTA_X) != -1.0101 and number(@DELTA_Y) != -1.0101 and number(@DELTA_Z) != -1.0101">The missing sentinel cannot represent canonical geometry.</sch:assert>
      <sch:assert test="not(number(@DELTA_X) = 0 and number(@DELTA_Y) = 0 and number(@DELTA_Z) = 0)">Zero-length canonical elements are forbidden.</sch:assert>
      <sch:assert test="normalize-space(@LINE) != ''">LINE is required and cannot be blank.</sch:assert>
      <sch:assert test="not(preceding-sibling::PIPINGELEMENT[@FROM_NODE = current()/@FROM_NODE and @TO_NODE = current()/@TO_NODE])">Duplicate directed node pairs are forbidden.</sch:assert>
      <sch:assert test="preceding::PIPINGELEMENT[@LINE = current()/@LINE] or (@DIAMETER and @WALL_THICK)">The first element of every LINE inheritance scope must provide DIAMETER and WALL_THICK.</sch:assert>
      <sch:assert test="not(@DIAMETER) or number(@DIAMETER) &gt; 0">DIAMETER must be positive when explicit.</sch:assert>
      <sch:assert test="not(@WALL_THICK) or number(@WALL_THICK) &gt;= 0">WALL_THICK cannot be negative.</sch:assert>
      <sch:assert test="not(@INSUL_THICK) or number(@INSUL_THICK) &gt;= 0">INSUL_THICK cannot be negative.</sch:assert>
      <sch:assert test="not(@CORR_ALLOW) or number(@CORR_ALLOW) &gt;= 0">CORR_ALLOW cannot be negative.</sch:assert>
      <sch:assert test="count(@FROM_X | @FROM_Y | @FROM_Z) = 0 or count(@FROM_X | @FROM_Y | @FROM_Z) = 3">FROM coordinate seeds must be a complete triplet or absent.</sch:assert>
      <sch:assert test="count(@TO_X | @TO_Y | @TO_Z) = 0 or count(@TO_X | @TO_Y | @TO_Z) = 3">TO coordinate seeds must be a complete triplet or absent.</sch:assert>
      <sch:assert test="(count(@FROM_X | @FROM_Y | @FROM_Z) = 0 and count(@TO_X | @TO_Y | @TO_Z) = 0) or (count(@FROM_X | @FROM_Y | @FROM_Z) = 3 and count(@TO_X | @TO_Y | @TO_Z) = 3)">Endpoint coordinate seeds must be supplied for both endpoints or neither endpoint.</sch:assert>
    </sch:rule>
  </sch:pattern>

  <sch:pattern id="auxiliary-ownership">
    <sch:rule context="/coade:CAESARII/PIPINGMODEL/PIPINGELEMENT/BEND">
      <sch:assert test="(not(@ANGLE1) and not(@NODE1)) or (@ANGLE1 and @NODE1)">BEND ANGLE1 and NODE1 must occur together.</sch:assert>
      <sch:assert test="(not(@ANGLE2) and not(@NODE2)) or (@ANGLE2 and @NODE2)">BEND ANGLE2 and NODE2 must occur together.</sch:assert>
      <sch:assert test="(not(@ANGLE3) and not(@NODE3)) or (@ANGLE3 and @NODE3)">BEND ANGLE3 and NODE3 must occur together.</sch:assert>
    </sch:rule>
    <sch:rule context="/coade:CAESARII/PIPINGMODEL/PIPINGELEMENT/RIGID">
      <sch:assert test="number(@WEIGHT) &gt;= 0">RIGID WEIGHT cannot be negative.</sch:assert>
    </sch:rule>
    <sch:rule context="/coade:CAESARII/PIPINGMODEL/PIPINGELEMENT/RESTRAINT">
      <sch:assert test="@NODE = ../@FROM_NODE or @NODE = ../@TO_NODE">RESTRAINT NODE must be owned by the containing element.</sch:assert>
      <sch:assert test="not(preceding-sibling::RESTRAINT[@NUM = current()/@NUM])">RESTRAINT NUM must be unique within its owner element.</sch:assert>
      <sch:assert test="number(@TYPE) &gt;= 1 and number(@TYPE) &lt;= 62">RESTRAINT TYPE must be an integer in the CII range 1..62.</sch:assert>
    </sch:rule>
    <sch:rule context="/coade:CAESARII/PIPINGMODEL/PIPINGELEMENT/SIF">
      <sch:assert test="@NODE = ../@FROM_NODE or @NODE = ../@TO_NODE">SIF NODE must be owned by the containing element.</sch:assert>
    </sch:rule>
    <sch:rule context="/coade:CAESARII/PIPINGMODEL/PIPINGELEMENT/HANGER">
      <sch:assert test="@NODE = ../@FROM_NODE or @NODE = ../@TO_NODE">HANGER NODE must be owned by the containing element.</sch:assert>
    </sch:rule>
  </sch:pattern>

  <sch:pattern id="extension-gate">
    <sch:rule context="ext:Record">
      <sch:assert test="@disposition != 'UNSUPPORTED_BLOCKING'">UNSUPPORTED_BLOCKING extension evidence blocks production validation.</sch:assert>
      <sch:assert test="not(@criticality = 'BLOCKING') or number(@confidence) = 1">Blocking extension evidence requires explicit confidence 1.00.</sch:assert>
    </sch:rule>
  </sch:pattern>
</sch:schema>

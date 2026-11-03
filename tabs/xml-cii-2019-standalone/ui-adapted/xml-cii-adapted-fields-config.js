export const MASTER_FIELDS = {
  lineList: {
    configKey: 'linelist',
    fields: [
      { name: 'lineSeqNo', label: 'Line Seq No.', aliases: ['Line number', 'Line No', 'Line Number', 'LINE_NO', 'Seq', 'Sequence'] },
      { name: 'lineKey1', label: 'Key 1', aliases: ['ColumnX1', 'LINE KEY', 'LINEKEY', 'Line Key', 'Pipeline Ref', 'PIPELINE_REF', 'Service', 'SERVICE'] },
      { name: 'lineKey2', label: 'Key 2', aliases: ['ColumnX2', 'Line Key 2', 'LineKey2', 'Suffix', 'Pipeline Ref 2', 'Line number', 'Line No', 'Line Number'] },
      { name: 'pipingClass', label: 'Piping Class', aliases: ['PIPING_CLASS', 'Piping Class', 'Class', 'Spec', 'SPEC'] },
      { name: 'rating', label: 'Rating', aliases: ['RATING', 'Rating', 'Pressure Class'] },
      { name: 'material', label: 'Material', aliases: ['MATERIAL', 'Material', 'Material_Name'] },
      { name: 'convertedBore', label: 'Bore', aliases: ['convertedBore', 'Converted Bore', 'DN', 'NB', 'Bore', 'Size', 'NPS'] },
      { name: 'p1', label: 'P1', aliases: ['P1', 'Design Pr', 'Op. Pr', 'Operating Pressure', 'Design Pressure', 'P1 / Design Pressure'] },
      { name: 'hydroPressure', label: 'Hydro Test Pressure', aliases: ['hydroPressure', 'Hydro Test Pressure', 'Hydrotest Pressure', 'Hydro Pressure', 'Hydro Pr', 'Hyd Test Pr', 'Hyd. Test Pressure', 'Test Pressure', 'TEST_PRESSURE', 'HYDRO_TEST_PRESSURE', 'Pressure Test', 'Proof Pressure', 'Hydro/Test Pressure'] },
      { name: 't1', label: 'T1', aliases: ['T1', 'Design Temp', 'Design Temperature', 'Op. Temp', 'Operating Temp', 'T1 (C)', 'T1 (ºC)'] },
      { name: 't2', label: 'T2', aliases: ['T2', 'Temp', 'Temp. C', 'Temp C', 'Temp ºC', 'Temperature', 'Temperature2', 'Temperature 2', 'T2 (C)', 'T2 (ºC)'] },
      { name: 't3', label: 'T3', aliases: ['T3', 'Temp Min', 'Temp Min C', 'Temp Min °C', 'Min Temp', 'Minimum Temp', 'Min', 'Temperature3', 'Temperature 3', 'T3 (C)', 'T3 (ºC)'] },
      { name: 'insThk', label: 'InsThk', aliases: ['InsThk', 'Insulation', 'Ins Thk', 'Insulation thickness'] },
      { name: 'density', label: 'Density', aliases: ['density', 'Density', 'DENSITY', 'FluidDensity', 'Fluid Density', 'Density kg/m3', 'kg/m3'] },
      { name: 'densityMixed', label: 'Density Mixed', aliases: ['Mixed kg/m3', 'Density Mixed', 'Mixed Density', 'Density (Mixed)'] },
      { name: 'densityGas', label: 'Density Gas', aliases: ['Gas kg/m3', 'Density Gas', 'Gas Density', 'Density (Gas)'] },
      { name: 'densityLiquid', label: 'Density Liquid', aliases: ['Liquid kg/m3', 'Density Liquid', 'Liquid Density', 'Density (Liquid)'] },
      { name: 'phase', label: 'Phase', aliases: ['Phase', 'Fluid Phase', 'Medium Phase'] },
      { name: 'from', label: 'From', aliases: ['From', 'FROM', 'From (Origin)', 'Origin', 'FROM_EQUIP', 'From Equipment'] },
      { name: 'to', label: 'To', aliases: ['To', 'TO', 'To (Destination)', 'Destination', 'TO_EQUIP', 'To Equipment'] }
    ]
  },
  pipingClass: {
    configKey: 'pipingClass',
    fields: [
      { name: 'pipingClass', label: 'Piping Class', required: true, aliases: ['Piping Class', 'PIPING_CLASS', 'Class', 'SPEC', 'Spec'] },
      { name: 'nps', label: 'NPS (in)', aliases: ['NPS', 'NPS (in)', 'Size (NPS)', 'Nominal Pipe Size', 'Nominal Size', 'Size'] },
      { name: 'convertedBore', label: 'Bore (mm)', required: true, aliases: ['Bore (mm)', 'Bore mm', 'BORE_MM', 'convertedBore', 'Converted Bore', 'DN', 'NB', 'Bore'] },
      { name: 'componentType', label: 'Component Type', aliases: ['Component Type', 'COMPONENT_TYPE', 'Type', 'Item Type'] },
      { name: 'rating', label: 'Rating', aliases: ['Rating', 'RATING', 'Pressure Class'] },
      { name: 'materialName', label: 'Material Name', aliases: ['Material_Name', 'Material', 'MATERIAL'] },
      { name: 'schedule', label: 'Schedule', aliases: ['Schedule', 'SCHEDULE', 'SCH'] },
      { name: 'wallThickness', label: 'Wall Thickness', aliases: ['Wall Thickness', 'WALL_THICKNESS', 'WT'] },
      { name: 'corrosion', label: 'Corrosion', aliases: ['Corrosion', 'Corrosion Allowance', 'CORROSION_ALLOWANCE', 'CA'] },
      { name: 'endCondition', label: 'End Condition', aliases: ['End Condition', 'END_CONDITION', 'End Type'] }
    ]
  },
  materialMap: {
    configKey: 'material',
    fields: [
      { name: 'code', label: 'Code', aliases: ['Code', 'Material Code', 'MATERIAL_CODE', 'CA3'] },
      { name: 'material', label: 'Material', aliases: ['Material', 'Material_Name', 'Description', 'Name'] },
      { name: 'spec', label: 'Spec', aliases: ['Spec', 'Specification'] }
    ]
  },
  weight: {
    configKey: 'weight',
    fields: [
      { name: 'bore', label: 'Bore', required: true, aliases: ['convertedBore', 'Converted Bore', 'Size (NPS)', 'Size', 'NPS', 'DN', 'NB', 'Bore'] },
      { name: 'rating', label: 'Rating', required: true, aliases: ['Rating', 'RATING', 'Class', 'CLASS', 'Pressure Class'] },
      { name: 'length', label: 'Length', required: true, aliases: ['Length (RF-F/F)', 'RF-F/F', 'Length', 'LEN', 'Face To Face', 'faceToFace'] },
      { name: 'valveType', label: 'Valve Type', aliases: ['Type Description', 'Valve Type', 'Type', 'Description'] },
      { name: 'weight', label: 'Weight', required: true, aliases: ['RF/RTJ KG', 'Valve Weight', 'Weight', 'weight', 'valveWeight'] }
    ]
  }
};

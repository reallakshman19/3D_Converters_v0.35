/**
 * units.js — Parse #$ UNITS section of CAESAR II neutral file.
 *
 * The UNITS section contains conversion factors and unit labels.
 * Format (CAESAR II v11):
 *   Line 1: length_factor temp_offset
 *   Line 2: force_factor mass_factor moment_factor
 *   Line 3: stress_factor
 *   Line 4+: unit label strings
 *
 * Typical metric values:
 *   25.4000  -17.7778
 *   4.44800  0.453592  0.112980
 *   0.00690  (kPa->bar or similar)
 *   mm. N. Kg. N.m. N./sq.mm. C bars KPa m.
 */

export function parseUnits(lines, log) {
  const units = {
    length: 'mm',
    force: 'N',
    mass: 'kg',
    moment: 'N.m',
    stress: 'N/sq.mm',
    temperature: '°C',
    pressure: 'bar',
    factors: {},
  };

  const dataLines = lines.filter(l => l.trim() && !l.trim().startsWith('*'));

  // Try to read label line (contains unit strings like "mm. N. Kg.")
  for (const line of dataLines) {
    if (/[a-zA-Z]/.test(line)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        // Map positional tokens to unit labels
        if (parts[0]) units.length = parts[0].replace('.', '');
        if (parts[1]) units.force = parts[1].replace('.', '');
        if (parts[2]) units.mass = parts[2].replace('.', '');
        if (parts[3]) units.moment = parts[3].replace('.', '');
        if (parts[4]) units.stress = parts[4].replace('.', '');
        if (parts[5]) units.temperature = parts[5].replace('.', '') === 'C' ? '°C' : parts[5];
        if (parts[6]) units.pressure = parts[6].replace('.', '');
      }
      break;
    }
  }

  log.push({ level: 'INFO', msg: `Units: length=${units.length}, force=${units.force}, stress=${units.stress}, temp=${units.temperature}, pressure=${units.pressure}` });
  return units;
}

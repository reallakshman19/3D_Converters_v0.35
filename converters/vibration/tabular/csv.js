export function vibrationTabularInputError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'VibrationTabularInputError';
  error.code = code;
  error.details = Object.freeze({ ...details });
  return error;
}

function trimTrailingBlankRows(rows) {
  const result = rows.map((row) => [...row]);
  while (result.length && result.at(-1).every((cell) => cell === '')) result.pop();
  return result;
}

export function parseStrictVibrationCsvRows(csvText) {
  const input = String(csvText ?? '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let justClosedQuote = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        justClosedQuote = true;
      } else {
        cell += char;
      }
      continue;
    }

    if (justClosedQuote) {
      if (char === ',') {
        row.push(cell);
        cell = '';
        justClosedQuote = false;
        continue;
      }
      if (char === '\n' || char === '\r') {
        if (char === '\r' && input[index + 1] === '\n') index += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        justClosedQuote = false;
        continue;
      }
      throw vibrationTabularInputError(
        'VIBRATION_CSV_MALFORMED',
        'Unexpected text appears after a closing quoted CSV field.',
        { index, char },
      );
    }

    if (char === '"') {
      if (cell !== '') {
        throw vibrationTabularInputError(
          'VIBRATION_CSV_MALFORMED',
          'A quoted CSV field must begin at the start of a field.',
          { index },
        );
      }
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (quoted) {
    throw vibrationTabularInputError(
      'VIBRATION_CSV_MALFORMED',
      'CSV input ends inside a quoted field.',
    );
  }
  if (cell !== '' || row.length || justClosedQuote) {
    row.push(cell);
    rows.push(row);
  }

  const result = trimTrailingBlankRows(rows);
  if (result.length && result[0].length) {
    result[0][0] = String(result[0][0]).replace(/^\uFEFF/u, '');
  }
  return result;
}

function csvScalar(value, rowIndex, columnIndex) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw vibrationTabularInputError(
        'VIBRATION_CSV_INVALID_SCALAR',
        'CSV numeric cells must be finite.',
        { row: rowIndex, column: columnIndex, value },
      );
    }
    return String(value);
  }
  throw vibrationTabularInputError(
    'VIBRATION_CSV_INVALID_SCALAR',
    'CSV cells must be string, finite number, boolean, null or undefined.',
    { row: rowIndex, column: columnIndex, valueType: typeof value },
  );
}

function quoteCsvCell(value) {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function serializeVibrationCsvRows(rows, options = {}) {
  if (!Array.isArray(rows)) {
    throw vibrationTabularInputError(
      'VIBRATION_CSV_ROWS_INVALID',
      'CSV rows must be an array of arrays.',
    );
  }
  const lineEnding = options.lineEnding ?? '\r\n';
  if (lineEnding !== '\r\n' && lineEnding !== '\n') {
    throw vibrationTabularInputError(
      'VIBRATION_CSV_LINE_ENDING_UNSUPPORTED',
      'CSV lineEnding must be CRLF or LF.',
      { lineEnding },
    );
  }
  const serialized = rows.map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw vibrationTabularInputError(
        'VIBRATION_CSV_ROWS_INVALID',
        'Every CSV row must be an array.',
        { row: rowIndex },
      );
    }
    return row.map((value, columnIndex) => quoteCsvCell(csvScalar(value, rowIndex, columnIndex))).join(',');
  });
  return `${serialized.join(lineEnding)}${serialized.length ? lineEnding : ''}`;
}

export function assertExactVibrationCsvHeader(rows, expectedHeader, contractName) {
  if (!Array.isArray(rows) || !rows.length) {
    throw vibrationTabularInputError(
      'VIBRATION_CSV_HEADER_MISMATCH',
      `${contractName} CSV is empty and has no header.`,
      { contractName },
    );
  }
  const actual = rows[0].map((value) => String(value ?? ''));
  const expected = [...expectedHeader];
  const same = actual.length === expected.length
    && expected.every((column, index) => actual[index] === column);
  if (!same) {
    throw vibrationTabularInputError(
      'VIBRATION_CSV_HEADER_MISMATCH',
      `${contractName} CSV header does not match the required v1 contract.`,
      { contractName, expected, actual },
    );
  }
  return rows;
}

export function nonBlankVibrationCsvRows(rows) {
  return rows.filter((row) => row.some((cell) => String(cell ?? '') !== ''));
}

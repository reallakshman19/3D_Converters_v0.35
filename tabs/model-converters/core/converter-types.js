/**
 * @typedef {Object} ConverterInputSpec
 * @property {string} role - 'primary' | 'secondary'
 * @property {string} label - Input display label
 * @property {string} accept - File extension filter (e.g. '.xml,.XML')
 * @property {boolean} required - Whether this input is mandatory
 */

/**
 * @typedef {Object} ConverterOptionSpec
 * @property {string} key - The option field name
 * @property {string} label - The label displayed in the UI
 * @property {'number'|'text'|'checkbox'|'select'|'json-popup'|'column-picker'|'support-type-rules'} type - Input type
 * @property {number} [step] - Step value for number inputs
 * @property {Array<string>} [options] - Select option values
 */

/**
 * @typedef {Object} ConverterDefinition
 * @property {string} id - Unique converter identifier
 * @property {string} label - Display label
 * @property {'3D Models'|'CAESAR II'} group - Converter category
 * @property {Array<ConverterInputSpec>} inputs - Input specifications
 * @property {Array<ConverterOptionSpec>} options - Configuration options
 * @property {Object} [defaults] - Default configuration values
 * @property {Array<string>} [workflow] - Phase IDs if this is a multi-step workflow converter
 * @property {function(ConverterContext): Promise<ConverterResult>} run - The conversion logic execution function
 */

/**
 * @typedef {Object} ConverterContext
 * @property {string} converterId - The running converter's ID
 * @property {Array<{name: string, bytes: ArrayBuffer|null, text: string|null}>} inputFiles - Files selected for conversion
 * @property {Object} options - Key-value pair options for execution
 * @property {Object} logger - Output logs receiver
 * @property {function(string)} logger.log - Standard message logger
 * @property {function(string)} logger.error - Error logger
 * @property {function(string, 'ok'|'bad'|'running'|'')} setStatus - Status state setter
 * @property {function(any)} [workerRunner] - Runner function for executing Python worker jobs
 */

/**
 * @typedef {Object} ConverterResult
 * @property {boolean} ok - Success status
 * @property {string} [error] - Error message if ok is false
 * @property {Array<{name: string, text: string, mime?: string, base64?: string}>} outputs - List of output files generated
 * @property {Object} [logs] - Custom stdout/stderr strings
 * @property {Array<string>} [logs.stdout] - Standard log lines
 * @property {Array<string>} [logs.stderr] - Error log lines
 * @property {Array<Object>} [diagnosticsRows] - Structured diagnostics for XML->CII
 */

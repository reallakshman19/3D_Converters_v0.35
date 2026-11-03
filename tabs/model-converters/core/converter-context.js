/**
 * ConverterContext represents the execution context passed to a converter's run method.
 */
export class ConverterContext {
  /**
   * @param {Object} params
   * @param {string} params.converterId
   * @param {Array<{name: string, bytes: ArrayBuffer|null, text: string|null}>} params.inputFiles
   * @param {Object} params.options
   * @param {Object} params.logger
   * @param {function(string, 'ok'|'bad'|'running'|'')} params.setStatus
   * @param {Object} [params.workerRunner]
   */
  constructor({ converterId, inputFiles, options, logger, setStatus, workerRunner }) {
    this.converterId = converterId;
    this.inputFiles = inputFiles;
    this.options = options || {};
    this.logger = logger || {
      log: (msg) => console.log(msg),
      error: (msg) => console.error(msg)
    };
    this.setStatus = setStatus || ((_status, _type) => {});
    this.workerRunner = workerRunner || null;
  }
}

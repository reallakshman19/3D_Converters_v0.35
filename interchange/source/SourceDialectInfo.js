export class SourceDialectInfo {
  constructor({ format = 'UNKNOWN', dialect = 'UNKNOWN', units = 'UNKNOWN', axisConvention = 'UNKNOWN', metadata = {} } = {}) {
    this.format = format;
    this.dialect = dialect;
    this.units = units;
    this.axisConvention = axisConvention;
    this.metadata = metadata;
  }
}

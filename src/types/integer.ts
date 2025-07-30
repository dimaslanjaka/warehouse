import SchemaTypeNumber from './number.js';
import ValidationError from '../error/validation.js';

/**
 * Integer schema type.
 */
class SchemaTypeInteger extends SchemaTypeNumber {

  /**
   * Casts a integer.
   *
   * @param {*} value_
   * @param {Object} data
   * @return {Number}
   */
  cast(value_?: unknown, data?: unknown): number {
    const value = super.cast(value_, data);

    return parseInt(value as any, 10);
  }

  /**
   * Validates an integer.
   *
   * @param {*} value_
   * @param {Object} data
   * @return {Number|Error}
   */
  validate(value_?: unknown, data?: unknown): number {
    const value = super.validate(value_, data);

    if (!Number.isInteger(value)) {
      throw new ValidationError(`\`${value}\` is not an integer!`);
    }

    return value as number;
  }
}


// For ESM compatibility
export default SchemaTypeInteger;
if (typeof module !== 'undefined' && typeof module.exports === 'object' && module.exports !== null) {
  // For CommonJS compatibility
  module.exports = SchemaTypeInteger;
  // For ESM compatibility
  module.exports.default = SchemaTypeInteger;
}

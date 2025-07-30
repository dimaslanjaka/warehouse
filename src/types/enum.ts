import SchemaType from '../schematype.js';
import ValidationError from '../error/validation.js';

/**
 * Enum schema type.
 */
class SchemaTypeEnum extends SchemaType<any[]> {
  declare options: SchemaType<any[]>['options'] & { elements: any[] };

  /**
   *
   * @param {String} name
   * @param {Object} options
   *   @param {Boolean} [options.required=false]
   *   @param {Array} options.elements
   *   @param {*} [options.default]
   */
  constructor(name: string, options?: Partial<SchemaType<any[]>['options']> & { elements?: any[] }) {
    super(name, Object.assign({
      elements: []
    }, options));
  }

  /**
   * Validates data. The value must be one of elements set in the options.
   *
   * @param {*} value_
   * @param {Object} data
   * @return {*}
   */
  validate(value_: unknown, data?: unknown) {
    const value = super.validate(value_, data);
    const elements = this.options.elements;

    if (!elements.includes(value)) {
      throw new ValidationError(`The value must be one of ${elements.join(', ')}`);
    }

    return value;
  }
}


// For ESM compatibility
export default SchemaTypeEnum;
if (typeof module !== 'undefined' && typeof module.exports === 'object' && module.exports !== null) {
  // For CommonJS compatibility
  module.exports = SchemaTypeEnum;
  // For ESM compatibility
  module.exports.default = SchemaTypeEnum;
}

import SchemaType from '../schematype.js';

/**
 * Object schema type.
 */
class SchemaTypeObject extends SchemaType<Record<string, any>> {

  /**
   *
   * @param {String} [name]
   * @param {Object} [options]
   *   @param {Boolean} [options.required=false]
   *   @param {Object|Function} [options.default={}]
   */
  constructor(name?: string, options?: Partial<SchemaType<Record<string, any>>['options']>) {
    super(name, Object.assign({ default: {} }, options));
  }
}


// For ESM compatibility
export default SchemaTypeObject;
if (typeof module !== 'undefined' && typeof module.exports === 'object' && module.exports !== null) {
  // For CommonJS compatibility
  module.exports = SchemaTypeObject;
  // For ESM compatibility
  module.exports.default = SchemaTypeObject;
}

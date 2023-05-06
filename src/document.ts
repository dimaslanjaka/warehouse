import rfdc from 'rfdc';
const cloneDeep = rfdc();

abstract class Document {
  abstract _model: import('./model').default;
  _id!: any;
  abstract _schema: import('./schema').default;

  /**
   * Document constructor.
   *
   * @param data
   */
  constructor(data: Record<string, any>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  /**
   * Saves the document.
   *
   * @param callback
   * @return
   */
  save(callback?: (...args: any[]) => any): Promise<any> {
    return this._model.save(this, callback);
  }

  /**
   * Updates the document.
   *
   * @param data
   * @param callback
   * @return
   */
  update(data: Record<string, any>, callback?: (...args: any[]) => any): Promise<any> {
    return this._model.updateById(this._id, data, callback);
  }

  /**
   * Replaces the document.
   *
   * @param data
   * @param callback
   * @return
   */
  replace(data: Record<string, any>, callback?: (...args: any[]) => any): Promise<any> {
    return this._model.replaceById(this._id, data, callback);
  }

  /**
   * Removes the document.
   *
   * @param callback
   * @return
   */
  remove(callback?: (...args: any[]) => any): Promise<any> {
    return this._model.removeById(this._id, callback);
  }

  /**
   * Returns a plain JavaScript object.
   *
   * @return
   */
  toObject(): Record<string, any> {
    const keys = Object.keys(this);
    const obj = {};

    for (let i = 0, len = keys.length; i < len; i++) {
      const key = keys[i];
      // Don't deep clone getters in order to avoid "Maximum call stack size
      // exceeded" error
      obj[key] = isGetter(this, key) ? this[key] : cloneDeep(this[key]);
    }

    return obj;
  }

  /**
   * Returns a string representing the document.
   *
   * @return
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Populates document references.
   *
   * @param expr
   * @return
   */
  populate(expr: string | Record<string, any>): Document {
    const stack = this._schema._parsePopulate(expr);
    return this._model._populate(this, stack);
  }
}

function isGetter(obj: any, key: PropertyKey) {
  return Object.getOwnPropertyDescriptor(obj, key).get;
}

export default Document;

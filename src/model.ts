import { EventEmitter } from 'events';
import rfdc from 'rfdc';
const cloneDeep = rfdc();
import BluebirdPromise from 'bluebird';
import { parseArgs, getProp, setGetter, shuffle } from './util';
import Document from './document';
import Query from './query';
import Schema from './schema';
import * as Types from './types/index';
import WarehouseError from './error';
import PopulationError from './error/population';
import Mutex from './mutex';
import type Database from './database';
import type { AddSchemaTypeOptions, NodeJSLikeCallback, Options, PopulateResult } from './types';

class Model<T> extends EventEmitter {
  _mutex = new Mutex();
  data: Record<PropertyKey, T> = {};
  schema: Schema<T>;
  length = 0;
  Document;
  Query;
  _database: Database;

  /**
   * Model constructor.
   *
   * @param {string} name Model name
   * @param {Schema|object} [schema_] Schema
   */
  constructor(public name: string, schema_: Schema<T> | Record<string, AddSchemaTypeOptions>) {
    super();

    let schema: Schema<T>;

    // Define schema
    if (schema_ instanceof Schema) {
      schema = schema_;
    } else if (typeof schema_ === 'object') {
      schema = new Schema(schema_);
    } else {
      schema = new Schema();
    }

    // Set `_id` path for schema
    if (!schema.path('_id')) {
      schema.path('_id', { type: Types.CUID, required: true });
    }

    this.schema = schema;

    class _Document<T> extends Document<T> {
      _model!: Model<T>;
      _schema!: Schema<T>;
      constructor(data: T) {
        super(data);

        // Apply getters
        schema._applyGetters(this);
      }
    }

    this.Document = _Document;

    _Document.prototype._model = this;
    _Document.prototype._schema = schema;

    class _Query<T> extends Query<T> {
      _model!: Model<T>;
      _schema!: Schema<T>;
    }

    this.Query = _Query;

    _Query.prototype._model = this;
    _Query.prototype._schema = schema;

    // Apply static methods
    Object.assign(this, schema.statics);

    // Apply instance methods
    Object.assign(_Document.prototype, schema.methods);
  }

  /**
   * Creates a new document.
   *
   * @param data
   * @return
   */
  new(data?: T): Document<T> {
    return new this.Document(data);
  }

  /**
   * Finds a document by its identifier.
   *
   * @param id
   * @param options
   *   @param {boolean} [options.lean=false] false = Returns a plain JavaScript object
   * @return
   */
  findById(id: PropertyKey, options_?: Options): Document<T> | T {
    const raw = this.data[id];
    if (!raw) return;

    const options = Object.assign(
      {
        lean: false
      },
      options_
    );

    const data = cloneDeep(raw);
    return options.lean ? data : this.new(data);
  }

  /**
   * Checks if the model contains a document with the specified id.
   *
   * @param id
   * @return
   */
  has(id: PropertyKey): boolean {
    return Boolean(this.data[id]);
  }

  /**
   * Acquires write lock.
   *
   * @return {BluebirdPromise}
   * @private
   */
  _acquireWriteLock(): BluebirdPromise.Disposer<void> {
    const mutex = this._mutex;

    return new BluebirdPromise((resolve, reject) => {
      mutex.lock(resolve);
    }).disposer(() => {
      mutex.unlock();
    });
  }

  /**
   * Inserts a document.
   *
   * @param {Document|object} data_
   * @return {BluebirdPromise}
   * @private
   */
  _insertOne(data_: Document<T> | T): BluebirdPromise<any> {
    const schema = this.schema;

    // Apply getters
    const data = (data_ instanceof this.Document ? data_ : this.new(data_ as T)) as Document<T>;
    const id = data._id;

    // Check ID
    if (!id) {
      return BluebirdPromise.reject(new WarehouseError('ID is not defined', WarehouseError.ID_UNDEFINED));
    }

    if (this.has(id)) {
      return BluebirdPromise.reject(new WarehouseError('ID `' + id + '` has been used', WarehouseError.ID_EXIST));
    }

    // Apply setters
    const result = data.toObject();
    schema._applySetters(result as object);

    // Pre-hooks
    return execHooks(schema, 'pre', 'save', data).then(data => {
      // Insert data
      this.data[id] = result;
      this.length++;

      this.emit('insert', data);
      return execHooks(schema, 'post', 'save', data);
    });
  }

  /**
   * Inserts a document.
   *
   * @param {object} data
   * @param {function} [callback]
   * @return {BluebirdPromise}
   */
  insertOne(data: Document<T> | T, callback?: NodeJSLikeCallback<any>): BluebirdPromise<any> {
    return BluebirdPromise.using(this._acquireWriteLock(), () => this._insertOne(data)).asCallback(callback);
  }

  /**
   * Inserts documents.
   *
   * @param {object|Array<any>} data
   * @param {function} [callback]
   * @return {BluebirdPromise}
   */
  insert(data: Document<T> | T | Document<T>[] | T[], callback?: NodeJSLikeCallback<any>): BluebirdPromise<any> {
    if (Array.isArray(data)) {
      return BluebirdPromise.mapSeries<Document<T> | T, any>(data, item => this.insertOne(item)).asCallback(callback);
    }

    return this.insertOne(data, callback);
  }

  /**
   * Inserts the document if it does not exist; otherwise updates it.
   *
   * @param {object} data
   * @param {function} [callback]
   * @return {BluebirdPromise}
   */
  save(data: Document<T> | T, callback?: NodeJSLikeCallback<any>): BluebirdPromise<any> {
    const id = (data as any)._id;

    if (!id) return this.insertOne(data, callback);

    return BluebirdPromise.using(this._acquireWriteLock(), () => {
      if (this.has(id)) {
        return this._replaceById(id, data);
      }

      return this._insertOne(data);
    }).asCallback(callback);
  }

  /**
   * Updates a document with a compiled stack.
   *
   * @param {*} id
   * @param {array} stack
   * @return {BluebirdPromise}
   * @private
   */
  _updateWithStack(id: string | number, stack: ((data: any) => void)[]): BluebirdPromise<any> {
    const schema = this.schema;

    const data = this.data[id];

    if (!data) {
      return BluebirdPromise.reject(new WarehouseError('ID `' + id + '` does not exist', WarehouseError.ID_NOT_EXIST));
    }

    // Clone data
    let result = cloneDeep(data);

    // Update
    for (let i = 0, len = stack.length; i < len; i++) {
      stack[i](result);
    }

    // Apply getters
    const doc = this.new(result);

    // Apply setters
    result = doc.toObject();
    schema._applySetters(result as object);

    // Pre-hooks
    return execHooks(schema, 'pre', 'save', doc).then(data => {
      // Update data
      this.data[id] = result;

      this.emit('update', data);
      return execHooks(schema, 'post', 'save', data);
    });
  }

  /**
   * Finds a document by its identifier and update it.
   *
   * @param {*} id
   * @param {object} update
   * @param {function} [callback]
   * @return {BluebirdPromise}
   */
  updateById(id: string | number, update: object, callback?: NodeJSLikeCallback<any>): BluebirdPromise<any> {
    return BluebirdPromise.using(this._acquireWriteLock(), () => {
      const stack = this.schema._parseUpdate(update as object);
      return this._updateWithStack(id, stack);
    }).asCallback(callback);
  }

  /**
   * Updates matching documents.
   *
   * @param {object} query
   * @param {object} data
   * @param {function} [callback]
   * @return {BluebirdPromise}
   */
  update(query: object, data: object, callback?: NodeJSLikeCallback<any>): BluebirdPromise<any> {
    return (this.find(query) as Query<T>).update(data, callback);
  }

  /**
   * Finds a document by its identifier and replace it.
   *
   * @param {*} id
   * @param  {object} data_
   * @return {BluebirdPromise}
   * @private
   */
  _replaceById(id: string | number, data_: Document<T> | T): BluebirdPromise<any> {
    const schema = this.schema;

    if (!this.has(id)) {
      return BluebirdPromise.reject(new WarehouseError('ID `' + id + '` does not exist', WarehouseError.ID_NOT_EXIST));
    }

    (data_ as any)._id = id;

    // Apply getters
    const data = (data_ instanceof this.Document ? data_ : this.new(data_ as T)) as Document<T>;

    // Apply setters
    const result = data.toObject();
    schema._applySetters(result as object);

    // Pre-hooks
    return execHooks(schema, 'pre', 'save', data).then(data => {
      // Replace data
      this.data[id] = result;

      this.emit('update', data);
      return execHooks(schema, 'post', 'save', data);
    });
  }

  /**
   * Finds a document by its identifier and replace it.
   *
   * @param {*} id
   * @param {object} data
   * @param {function} [callback]
   * @return {BluebirdPromise}
   */
  replaceById(id: string | number, data: Document<T> | T, callback?: NodeJSLikeCallback<any>): BluebirdPromise<any> {
    return BluebirdPromise.using(this._acquireWriteLock(), () => this._replaceById(id, data)).asCallback(callback);
  }

  /**
   * Replaces matching documents.
   *
   * @param {object} query
   * @param {object} data
   * @param {function} [callback]
   * @return {BluebirdPromise}
   */
  replace(query: object, data, callback?: NodeJSLikeCallback<any>): BluebirdPromise<any> {
    return (this.find(query) as Query<T>).replace(data, callback);
  }

  /**
   * Finds a document by its identifier and remove it.
   *
   * @param {*} id
   * @return {BluebirdPromise}
   * @private
   */
  _removeById(id: string | number): BluebirdPromise<any> {
    const schema = this.schema;

    const data = this.data[id];

    if (!data) {
      return BluebirdPromise.reject(new WarehouseError('ID `' + id + '` does not exist', WarehouseError.ID_NOT_EXIST));
    }

    // Pre-hooks
    return execHooks(schema, 'pre', 'remove', data).then(data => {
      // Remove data
      this.data[id] = null;
      this.length--;

      this.emit('remove', data);
      return execHooks(schema, 'post', 'remove', data);
    });
  }

  /**
   * Finds a document by its identifier and remove it.
   *
   * @param {*} id
   * @param {function} [callback]
   * @return {BluebirdPromise}
   */
  removeById(id: string | number, callback?: NodeJSLikeCallback<any>): BluebirdPromise<any> {
    return BluebirdPromise.using(this._acquireWriteLock(), () => this._removeById(id)).asCallback(callback);
  }

  /**
   * Removes matching documents.
   *
   * @param {object} query
   * @param {function} [callback]
   * @return {BluebirdPromise}
   */
  remove(query: object, callback?: NodeJSLikeCallback<any>): BluebirdPromise<any> {
    return (this.find(query) as Query<T>).remove(callback);
  }

  /**
   * Deletes a model.
   */
  destroy(): void {
    this._database._models[this.name] = null;
  }

  /**
   * Returns the number of elements.
   *
   * @return {number}
   */
  count(): number {
    return this.length;
  }

  /**
   * Iterates over all documents.
   *
   * @param {function} iterator
   * @param {object} [options] See {@link Model#findById}.
   */
  forEach(iterator: (value: any, index: number) => void, options?: Options): void {
    const keys = Object.keys(this.data);
    let num = 0;

    for (let i = 0, len = keys.length; i < len; i++) {
      const data = this.findById(keys[i], options);
      if (data) iterator(data, num++);
    }
  }

  /**
   * Returns an array containing all documents.
   *
   * @param {Object} [options] See {@link Model#findById}.
   * @return {Array}
   */
  toArray(options?: Options): any[] {
    const result = new Array(this.length);

    this.forEach((item, i) => {
      result[i] = item;
    }, options);

    return result;
  }

  /**
   * Finds matching documents.
   *
   * @param {Object} query
   * @param {Object} [options]
   *   @param {Number} [options.limit=0] Limits the number of documents returned.
   *   @param {Number} [options.skip=0] Skips the first elements.
   *   @param {Boolean} [options.lean=false] Returns a plain JavaScript object.
   * @return {Query|Array}
   */
  find(query: object): Query<T>;
  find(query: object, options: Options): Query<T> | T[];
  find(query: object, options: Options = {}): Query<T> | T[] {
    const filter = this.schema._execQuery(query);
    const keys = Object.keys(this.data);
    const len = keys.length;
    let limit = options.limit || this.length;
    let skip = options.skip;
    const data = this.data;
    const arr: (T | Document<T>)[] = [];

    for (let i = 0; limit && i < len; i++) {
      const key = keys[i];
      const item = data[key];

      if (item && filter(item)) {
        if (skip) {
          skip--;
        } else {
          arr.push(this.findById(key, options));
          limit--;
        }
      }
    }

    return options.lean ? arr : new this.Query(arr);
  }

  /**
   * Finds the first matching documents.
   *
   * @param {Object} query
   * @param {Object} [options]
   *   @param {Number} [options.skip=0] Skips the first elements.
   *   @param {Boolean} [options.lean=false] Returns a plain JavaScript object.
   * @return {Document|Object}
   */
  findOne(query: object): Document<T>;
  findOne(query: object, options_ : Options): Document<T> | T;
  findOne(query: object, options_ : Options = {}): Document<T> | T {
    const options = Object.assign(options_, { limit: 1 });

    const result = this.find(query, options);
    return options.lean ? (result as any[])[0] : (result as Query<T>).toArray()[0];
  }

  /**
   * Sorts documents. See {@link Query#sort}.
   *
   * @param {String|Object} orderby
   * @param {String|Number} [order]
   * @return {Query}
   */
  sort(orderby: string | object, order?: string | number): Query<T> {
    const sort = parseArgs(orderby, order);
    const fn = this.schema._execSort(sort);

    return new this.Query(this.toArray().sort(fn));
  }

  /**
   * Returns the document at the specified index. `num` can be a positive or
   * negative number.
   *
   * @param {Number} i
   * @param {Object} [options] See {@link Model#findById}.
   * @return {Document|Object}
   */
  eq(i_: number, options?: Options): Document<T> | Record<PropertyKey, any> {
    let index = i_ < 0 ? this.length + i_ : i_;
    const data = this.data;
    const keys = Object.keys(data);

    for (let i = 0, len = keys.length; i < len; i++) {
      const key = keys[i];
      const item = data[key];

      if (!item) continue;

      if (index) {
        index--;
      } else {
        return this.findById(key, options);
      }
    }
  }

  /**
   * Returns the first document.
   *
   * @param {Object} [options] See {@link Model#findById}.
   * @return {Document|Object}
   */
  first(options?: Options): Document<T> | Record<PropertyKey, any> {
    return this.eq(0, options);
  }

  /**
   * Returns the last document.
   *
   * @param {Object} [options] See {@link Model#findById}.
   * @return {Document|Object}
   */
  last(options?: Options): Document<T> | Record<PropertyKey, any> {
    return this.eq(-1, options);
  }

  /**
   * Returns the specified range of documents.
   *
   * @param {Number} start
   * @param {Number} [end]
   * @return {Query}
   */
  slice(start_?: number, end_?: number): Query<T> {
    const total = this.length;

    let start = start_ | 0;
    if (start < 0) start += total;
    if (start > total - 1) return new this.Query([]);

    let end = end_ | 0 || total;
    if (end < 0) end += total;

    let len = start > end ? 0 : end - start;
    if (len > total) len = total - start;
    if (!len) return new this.Query([]);

    const arr = new Array(len);
    const keys = Object.keys(this.data);
    const keysLen = keys.length;
    let num = 0;

    for (let i = 0; num < len && i < keysLen; i++) {
      const data = this.findById(keys[i]);
      if (!data) continue;

      if (start) {
        start--;
      } else {
        arr[num++] = data;
      }
    }

    return new this.Query(arr);
  }

  /**
   * Limits the number of documents returned.
   *
   * @param {Number} i
   * @return {Query}
   */
  limit(i: number): Query<T> {
    return this.slice(0, i);
  }

  /**
   * Specifies the number of items to skip.
   *
   * @param {Number} i
   * @return {Query}
   */
  skip(i: number): Query<T> {
    return this.slice(i);
  }

  /**
   * Returns documents in a reversed order.
   *
   * @return {Query}
   */
  reverse(): Query<T> {
    return new this.Query(this.toArray().reverse());
  }

  /**
   * Returns documents in random order.
   *
   * @return {Query}
   */
  shuffle(): Query<T> {
    return new this.Query(shuffle(this.toArray()));
  }

  /**
   * Creates an array of values by iterating each element in the collection.
   *
   * @param {Function} iterator
   * @param {Object} [options]
   * @return {Array}
   */
  map<T>(iterator: (value: any, index: number) => T, options?: Options): T[] {
    const result = new Array(this.length);
    const keys = Object.keys(this.data);
    const len = keys.length;

    for (let i = 0, num = 0; i < len; i++) {
      const data = this.findById(keys[i], options);
      if (data) {
        result[num] = iterator(data, num);
        num++;
      }
    }

    return result;
  }

  /**
   * Reduces a collection to a value which is the accumulated result of iterating
   * each element in the collection.
   *
   * @param {Function} iterator
   * @param {*} [initial] By default, the initial value is the first document.
   * @return {*}
   */
  reduce<T>(iterator: (pre: any, cur: any, index: number) => T, initial?: T): T {
    const arr = this.toArray();
    const len = this.length;
    let i: number, result: any;

    if (initial === undefined) {
      i = 1;
      result = arr[0];
    } else {
      i = 0;
      result = initial;
    }

    for (; i < len; i++) {
      result = iterator(result, arr[i], i);
    }

    return result;
  }

  /**
   * Reduces a collection to a value which is the accumulated result of iterating
   * each element in the collection from right to left.
   *
   * @param {Function} iterator
   * @param {*} [initial] By default, the initial value is the last document.
   * @return {*}
   */
  reduceRight<T>(iterator: (pre: any, cur: any, index: number) => T, initial?: T): T {
    const arr = this.toArray();
    const len = this.length;
    let i, result;

    if (initial === undefined) {
      i = len - 2;
      result = arr[len - 1];
    } else {
      i = len - 1;
      result = initial;
    }

    for (; i >= 0; i--) {
      result = iterator(result, arr[i], i);
    }

    return result;
  }

  /**
   * Creates a new array with all documents that pass the test implemented by the
   * provided function.
   *
   * @param {Function} iterator
   * @param {Object} [options]
   * @return {Query}
   */
  filter(iterator: (value: any, index: number) => any, options?: Options): Query<T> {
    const arr = [];

    this.forEach((item: any, i: number) => {
      if (iterator(item, i)) arr.push(item);
    }, options);

    return new this.Query(arr);
  }

  /**
   * Tests whether all documents pass the test implemented by the provided
   * function.
   *
   * @param {Function} iterator
   * @return {Boolean}
   */
  every(iterator: (value: any, index: number) => any): boolean {
    const keys = Object.keys(this.data);
    const len = keys.length;
    let num = 0;

    if (!len) return true;

    for (let i = 0; i < len; i++) {
      const data = this.findById(keys[i]);

      if (data) {
        if (!iterator(data, num++)) return false;
      }
    }

    return true;
  }

  /**
   * Tests whether some documents pass the test implemented by the provided
   * function.
   *
   * @param {Function} iterator
   * @return {Boolean}
   */
  some(iterator: (value: any, index: number) => any): boolean {
    const keys = Object.keys(this.data);
    const len = keys.length;
    let num = 0;

    if (!len) return false;

    for (let i = 0; i < len; i++) {
      const data = this.findById(keys[i]);

      if (data) {
        if (iterator(data, num++)) return true;
      }
    }

    return false;
  }

  /**
   * Returns a getter function for normal population.
   *
   * @param {Object} data
   * @param {Model} model
   * @param {Object} options
   * @return {Function}
   * @private
   */
  _populateGetter(data: string | number, model: Model<T>, options: unknown) {
    let hasCache = false;
    let cache: Record<PropertyKey, any> | Document<T>;

    return () => {
      if (!hasCache) {
        cache = model.findById(data);
        hasCache = true;
      }

      return cache;
    };
  }

  /**
   * Returns a getter function for array population.
   *
   * @param {Object} data
   * @param {Model} model
   * @param {Object} options
   * @return {Function}
   * @private
   */
  _populateGetterArray(data: any[], model: Model<T>, options: Options): () => any[] | Query<T> {
    const Query = model.Query;
    let hasCache = false;
    let cache: any[] | Query<T>;

    return () => {
      if (!hasCache) {
        let arr = [];

        for (let i = 0, len = data.length; i < len; i++) {
          arr.push(model.findById(data[i]));
        }

        if (options.match) {
          cache = (new Query(arr) as Query<T>).find(options.match, options);
        } else if (options.skip) {
          if (options.limit) {
            arr = arr.slice(options.skip, options.skip + options.limit);
          } else {
            arr = arr.slice(options.skip);
          }

          cache = new Query(arr);
        } else if (options.limit) {
          cache = new Query(arr.slice(0, options.limit));
        } else {
          cache = new Query(arr);
        }

        if (options.sort) {
          cache = cache.sort(options.sort);
        }

        hasCache = true;
      }

      return cache;
    };
  }

  /**
   * Populates document references with a compiled stack.
   *
   * @param {Object} data
   * @param {Array} stack
   * @return {Object}
   * @private
   */
  _populate(data: Document<T>, stack: PopulateResult[]): Document<T> {
    const models = this._database._models;

    for (let i = 0, len = stack.length; i < len; i++) {
      const item = stack[i];
      const model = models[item.model];

      if (!model) {
        throw new PopulationError('Model `' + item.model + '` does not exist');
      }

      const path = item.path;
      const prop = getProp(data, path);

      if (Array.isArray(prop)) {
        setGetter(data, path, this._populateGetterArray(prop, model, item));
      } else {
        setGetter(data, path, this._populateGetter(prop, model, item));
      }
    }

    return data;
  }

  /**
   * Populates document references.
   *
   * @param {String|Object} path
   * @return {Query}
   */
  populate(path: string | any[] | { path?: string; model?: any; [key: PropertyKey]: any }): Query<T> {
    if (!path) throw new TypeError('path is required');

    const stack = this.schema._parsePopulate(path);
    const arr = new Array(this.length);

    this.forEach((item, i) => {
      arr[i] = this._populate(item, stack);
    });

    return new this.Query(arr);
  }

  /**
   * Imports data.
   *
   * @param {Array} arr
   * @private
   */
  _import(arr: any[]) {
    const len = arr.length;
    const data = this.data;
    const schema = this.schema;

    for (let i = 0; i < len; i++) {
      const item = arr[i];
      data[item._id] = schema._parseDatabase(item) as T;
    }

    this.length = len;
  }

  /**
   * Exports data.
   *
   * @return {String}
   * @private
   */
  _export(): string {
    return JSON.stringify(this.toJSON());
  }

  toJSON(): any[] {
    const result = new Array(this.length);
    const { data, schema } = this;
    const keys = Object.keys(data);
    const { length } = keys;

    for (let i = 0, num = 0; i < length; i++) {
      const raw = data[keys[i]];
      if (raw) {
        result[num++] = schema._exportDatabase(cloneDeep(raw) as object);
      }
    }
    return result;
  }
  get: Model<T>['findById'];
  size: Model<T>['count'];
  each: Model<T>['forEach'];
  random: Model<T>['shuffle'];
}

Model.prototype.get = Model.prototype.findById;

function execHooks<T>(schema: Schema<T>, type: string, event: string, data: any): BluebirdPromise<any> {
  const hooks = schema.hooks[type][event] as ((data: any) => BluebirdPromise<void> | void)[];
  if (!hooks.length) return BluebirdPromise.resolve(data);

  return BluebirdPromise.each(hooks, hook => hook(data)).thenReturn(data);
}

Model.prototype.size = Model.prototype.count;

Model.prototype.each = Model.prototype.forEach;

Model.prototype.random = Model.prototype.shuffle;

export default Model;

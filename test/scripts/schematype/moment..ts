import SchemaType from '../../../src/schematype.js';
import moment from 'moment-timezone';
import * as chai from 'chai';

const should = chai.should();

// It'll pollute the moment module.
// declare module 'moment' {
//   export default interface Moment extends moment.Moment {
//     _d: Date;
//   // eslint-disable-next-line semi
//   }
// }

class SchemaTypeMoment extends SchemaType<moment.Moment> {
  declare options: any;

  constructor(name: string, options = {}) {
    super(name, options);
  }

  cast<T = moment.Moment>(value?: any, data?: any): T {
    value = super.cast(value, data);
    if (value == null) return value;

    // If the value is already a moment instance, return as is (typed)
    if (moment.isMoment(value)) return value as T;
    // Otherwise, convert to moment
    return toMoment(value) as T;
  }

  validate<T = moment.Moment>(value: any, data?: any): T {
    value = super.validate(value, data);
    if (value == null) return value;

    // If already a moment instance, use as is, else convert
    const m = moment.isMoment(value) ? value : toMoment(value);

    if (!m.isValid()) {
      throw new Error('`' + value + '` is not a valid date!');
    }

    return m as T;
  }

  match(
    value: moment.Moment | moment.MomentInput | undefined,
    query: moment.Moment | moment.MomentInput | undefined,
    _data?: any
  ): boolean {
    if (!value || !query) return false;
    if (typeof value.valueOf === 'function' && typeof query.valueOf === 'function') {
      return value.valueOf() === query.valueOf();
    }
    return false;
  }

  compare(a?, b?) {
    if (a) {
      if (b) return a - b;
      return 1;
    }

    if (b) return -1;
    return 0;
  }

  parse(value?: moment.MomentInput): moment.Moment | undefined {
    if (value) return toMoment(value);
  }

  value(value?: moment.Moment, _data?: any): string | undefined {
    // Backward compatibility: try value._d.toISOString(), fallback to value.toISOString()
    if (!value) return undefined;
    // Prefer public API if available
    if (typeof value.toISOString === 'function') {
      try {
        return value.toISOString();
      } catch {}
    }
    // Fallback for legacy moment objects
    const raw = (value as any)._d;
    if (raw && typeof raw.toISOString === 'function') {
      try {
        return raw.toISOString();
      } catch {}
    }
    return undefined;
  }

  q$day(value: moment.Moment, query: number, _data?: undefined) {
    return value ? value.date() === query : false;
  }

  q$month(value: moment.Moment, query: number, _data?: undefined) {
    return value ? value.month() === query : false;
  }

  q$year(value: moment.Moment, query: number, _data?: undefined) {
    return value ? value.year() === query : false;
  }

  u$inc(value: moment.Moment, update: moment.DurationInputArg1, _data?: undefined) {
    if (!value) return value;
    return value.add(update);
  }

  u$dec(value: moment.Moment, update: moment.DurationInputArg1, _data?: undefined) {
    if (!value) return value;
    return value.subtract(update);
  }
}

export function toMoment(value: moment.Moment | moment.MomentInput): moment.Moment {
  // If already a moment instance, return as is
  if (moment.isMoment(value)) return value;

  // If value is a moment-like object (with _d), extract the native Date
  if (value && typeof value === 'object' && '_d' in value && value._d instanceof Date) {
    return moment(value._d);
  }

  // If value is a Date or primitive (string, number, array), convert directly
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number' || Array.isArray(value)) {
    return moment(value);
  }

  // If object with a .date() method
  if (value && typeof value === 'object' && typeof(value as any).date === 'function') {
    return moment((value as any).date());
  }

  // Fallback to moment constructor
  return moment(value);
}

describe('SchemaTypeMoment', () => {
  const type = new SchemaTypeMoment('test');

  it('cast()', () => {
    type.cast(1e8).should.eql(moment(1e8));
    type.cast(new Date(2014, 1, 1)).should.eql(moment(new Date(2014, 1, 1)));
    type.cast('2014-11-03T07:45:41.237Z').should.eql(moment('2014-11-03T07:45:41.237Z'));
    type.cast(moment(1e8)).valueOf().should.eql(1e8);
  });

  it('cast() - default', () => {
    const type = new SchemaTypeMoment('test', {default: moment});
    moment.isMoment(type.cast()).should.be.true;
  });

  function shouldThrowError(value) {
    should.throw(
      () => type.validate(value),
      '`' + value + '` is not a valid date!'
    );
  }

  it('validate()', () => {
    type.validate(moment(1e8)).valueOf().should.eql(1e8);
    shouldThrowError(moment.invalid());
  });

  it('validate() - required', () => {
    const type = new SchemaTypeMoment('test', {required: true});
    // @ts-expect-error
    should.throw(() => type.validate(), '`test` is required!');
  });

  it('match()', () => {
    type.match(moment(1e8), moment(1e8)).should.be.true;
    type.match(moment(1e8), moment(1e8 + 1)).should.be.false;
    type.match(undefined, moment()).should.be.false;
  });

  it('compare()', () => {
    type.compare(moment([2014, 1, 3]), moment([2014, 1, 2])).should.gt(0);
    type.compare(moment([2014, 1, 1]), moment([2014, 1, 2])).should.lt(0);
    type.compare(moment([2014, 1, 2]), moment([2014, 1, 2])).should.eql(0);
    type.compare(moment()).should.eql(1);
    type.compare(undefined, moment()).should.eql(-1);
    type.compare().should.eql(0);
  });

  it('parse()', () => {
    type.parse('2014-11-03T07:45:41.237Z')!.should.eql(moment('2014-11-03T07:45:41.237Z'));
    should.not.exist(type.parse());
  });

  it('value()', () => {
    type.value(moment('2014-11-03T07:45:41.237Z')).should.eql('2014-11-03T07:45:41.237Z');
    should.not.exist(type.value());
  });

  it('q$day()', () => {
    type.q$day(moment([2014, 1, 1]), 1).should.be.true;
    type.q$day(moment([2014, 1, 1]), 5).should.be.false;
    type.q$day(undefined, 1).should.be.false;
  });

  it('q$month()', () => {
    type.q$month(moment([2014, 1, 1]), 1).should.be.true;
    type.q$month(moment([2014, 1, 1]), 5).should.be.false;
    type.q$month(undefined, 1).should.be.false;
  });

  it('q$year()', () => {
    type.q$year(moment([2014, 1, 1]), 2014).should.be.true;
    type.q$year(moment([2014, 1, 1]), 1999).should.be.false;
    type.q$year(undefined, 1).should.be.false;
  });

  it('u$inc()', () => {
    type.u$inc(moment(1e8), 1).valueOf().should.eql(1e8 + 1);
    // @ts-expect-error
    should.not.exist(undefined, 1);
  });

  it('u$dec()', () => {
    type.u$dec(moment(1e8), 1).valueOf().should.eql(1e8 - 1);
    // @ts-expect-error
    should.not.exist(undefined, 1);
  });
});
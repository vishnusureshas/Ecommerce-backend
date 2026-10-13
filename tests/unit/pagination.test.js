import { parsePagination, toPagedResult } from '../../src/common/utils/pagination.js';
import { pick } from '../../src/common/utils/pick.js';

describe('parsePagination', () => {
  it('defaults to page 1, limit 20, skip 0', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('parses string query values', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it('clamps limit to the maximum of 100', () => {
    expect(parsePagination({ page: '2', limit: '500' })).toEqual({ page: 2, limit: 100, skip: 100 });
  });

  it('falls back to defaults on invalid values', () => {
    expect(parsePagination({ page: '-3', limit: 'abc' })).toEqual({ page: 1, limit: 20, skip: 0 });
    expect(parsePagination({ page: '0', limit: '0' })).toEqual({ page: 1, limit: 20, skip: 0 });
  });
});

describe('toPagedResult', () => {
  it('builds consistent pagination metadata', () => {
    expect(toPagedResult({ items: [1], total: 45, page: 2, limit: 20 })).toEqual({
      items: [1],
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('handles empty results without zero totalPages', () => {
    const result = toPagedResult({ items: [], total: 0, page: 1, limit: 20 });
    expect(result.totalPages).toBe(1);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(false);
  });
});

describe('pick', () => {
  it('keeps only allowlisted keys', () => {
    expect(pick({ name: 'a', role: 'admin' }, ['name'])).toEqual({ name: 'a' });
  });

  it('drops undefined values and tolerates non-objects', () => {
    expect(pick({ a: undefined, b: 1 }, ['a', 'b'])).toEqual({ b: 1 });
    expect(pick(null, ['a'])).toEqual({});
  });
});

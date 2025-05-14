import { describe, it, expect, beforeEach } from 'vitest';
import { eq, gt, lt, like, _in, notIn, between, and, or } from '../filters';
import knex from 'knex';

describe('Query Filters', () => {
  let knexInstance: any;
  let queryBuilder: any;

  beforeEach(() => {
    knexInstance = knex({ client: 'pg' });
    queryBuilder = knexInstance('test_table');
  });

  it('eq должен создавать условие равенства', () => {
    eq('name', 'John')(queryBuilder);
    const { sql, bindings } = queryBuilder.toSQL();
    expect(sql).toContain('where "name" = ?');
    expect(bindings).toEqual(['John']);
  });

  it('gt должен создавать условие больше чем', () => {
    gt('age', 18)(queryBuilder);
    const { sql, bindings } = queryBuilder.toSQL();
    expect(sql).toContain('where "age" > ?');
    expect(bindings).toEqual([18]);
  });

  it('lt должен создавать условие меньше чем', () => {
    lt('price', 100)(queryBuilder);
    const { sql, bindings } = queryBuilder.toSQL();
    expect(sql).toContain('where "price" < ?');
    expect(bindings).toEqual([100]);
  });

  it('like должен создавать условие LIKE', () => {
    like('email', '%@example.com')(queryBuilder);
    const { sql, bindings } = queryBuilder.toSQL();
    expect(sql).toContain('where "email" like ?');
    expect(bindings).toEqual(['%@example.com']);
  });

  it('_in должен создавать условие IN', () => {
    _in('status', ['active', 'pending'])(queryBuilder);
    const { sql, bindings } = queryBuilder.toSQL();
    expect(sql).toContain('where "status" in (?, ?)');
    expect(bindings).toEqual(['active', 'pending']);
  });

  it('notIn должен создавать условие NOT IN', () => {
    notIn('category', ['deleted', 'archived'])(queryBuilder);
    const { sql, bindings } = queryBuilder.toSQL();
    expect(sql).toContain('where "category" not in (?, ?)');
    expect(bindings).toEqual(['deleted', 'archived']);
  });

  it('between должен создавать условие BETWEEN', () => {
    between('created_at', ['2023-01-01', '2023-12-31'])(queryBuilder);
    const { sql, bindings } = queryBuilder.toSQL();
    expect(sql).toContain('where "created_at" between ? and ?');
    expect(bindings).toEqual(['2023-01-01', '2023-12-31']);
  });

  it('and должен объединять условия через AND', () => {
    and([
      eq('status', 'active'),
      gt('age', 18)
    ])(queryBuilder);
    const { sql, bindings } = queryBuilder.toSQL();
    expect(sql).toContain('where');
    expect(sql).toContain('"status" = ?');
    expect(sql).toContain('"age" > ?');
    expect(sql).toContain('and');
    expect(bindings).toEqual(['active', 18]);
  });

  it('or должен объединять условия через OR', () => {
    or([
      eq('type', 'user'),
      eq('type', 'admin')
    ])(queryBuilder);
    const { sql, bindings } = queryBuilder.toSQL();
    expect(sql).toContain('where');
    expect(sql).toContain('"type" = ?');
    expect(sql).toContain('or');
    expect(bindings).toEqual(['user', 'admin']);
  });
}); 
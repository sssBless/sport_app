import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateQueryBuilder } from '../updateQueryBuilder';
import knex from 'knex';

describe('UpdateQueryBuilder', () => {
  let knexInstance: any;

  beforeEach(() => {
    knexInstance = knex({ client: 'pg' });
  });

  it('должен создавать базовый UPDATE запрос', () => {
    const builder = new UpdateQueryBuilder(knexInstance, {
      table: 'users',
      values: { name: 'John', email: 'john@example.com' },
      where: (qb) => qb.where('id', '=', 1)
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('update "users" set "name" = ?, "email" = ? where "id" = ?');
    expect(bindings).toEqual(['John', 'john@example.com', 1]);
  });

  it('должен корректно обрабатывать null значения', () => {
    const builder = new UpdateQueryBuilder(knexInstance, {
      table: 'users',
      values: { name: null, email: 'john@example.com' },
      where: (qb) => qb.where('id', '=', 1)
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('update "users" set "name" = ?, "email" = ? where "id" = ?');
    expect(bindings).toContain(null);
  });

  it('должен поддерживать сложные условия WHERE', () => {
    const builder = new UpdateQueryBuilder(knexInstance, {
      table: 'users',
      values: { status: 'active' },
      where: (qb) => {
        qb.where('age', '>', 18)
          .andWhere('status', '=', 'pending');
      }
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('update "users" set "status" = ? where "age" > ? and "status" = ?');
    expect(bindings).toEqual(['active', 18, 'pending']);
  });

  it('должен работать со схемой', () => {
    const builder = new UpdateQueryBuilder(knexInstance, {
      schema: 'public',
      table: 'users',
      values: { status: 'active' },
      where: (qb) => qb.where('id', '=', 1)
    });

    const { sql } = builder.toSQL();
    expect(sql).toContain('update "public"."users"');
  });
}); 
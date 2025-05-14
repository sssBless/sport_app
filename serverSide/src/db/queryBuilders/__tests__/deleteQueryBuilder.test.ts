import { describe, it, expect, beforeEach } from 'vitest';
import { DeleteQueryBuilder } from '../deleteQueryBuilder';
import knex from 'knex';

describe('DeleteQueryBuilder', () => {
  let knexInstance: any;

  beforeEach(() => {
    knexInstance = knex({ client: 'pg' });
  });

  it('должен создавать базовый DELETE запрос', () => {
    const builder = new DeleteQueryBuilder(knexInstance, {
      table: 'users',
      where: (qb) => qb.where('id', '=', 1)
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('delete from "users" where "id" = ?');
    expect(bindings).toEqual([1]);
  });

  it('должен поддерживать сложные условия WHERE', () => {
    const builder = new DeleteQueryBuilder(knexInstance, {
      table: 'users',
      where: (qb) => {
        qb.where('status', '=', 'inactive')
          .andWhere('last_login', '<', '2023-01-01');
      }
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('delete from "users" where "status" = ? and "last_login" < ?');
    expect(bindings).toEqual(['inactive', '2023-01-01']);
  });

  it('должен поддерживать условия WHERE с OR', () => {
    const builder = new DeleteQueryBuilder(knexInstance, {
      table: 'users',
      where: (qb) => {
        qb.where('status', '=', 'banned')
          .orWhere('violations', '>', 3);
      }
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('delete from "users" where "status" = ? or "violations" > ?');
    expect(bindings).toEqual(['banned', 3]);
  });

  it('должен работать со схемой', () => {
    const builder = new DeleteQueryBuilder(knexInstance, {
      schema: 'public',
      table: 'users',
      where: (qb) => qb.where('id', '=', 1)
    });

    const { sql } = builder.toSQL();
    expect(sql).toContain('delete from "public"."users"');
  });
}); 
import { describe, it, expect, beforeEach } from 'vitest';
import { SelectQueryBuilder } from '../selectQueryBuilder';
import knex from 'knex';

describe('SelectQueryBuilder', () => {
  let knexInstance: any;

  beforeEach(() => {
    knexInstance = knex({ client: 'pg' });
  });

  it('должен создавать базовый SELECT запрос', () => {
    const builder = new SelectQueryBuilder(knexInstance, {
      table: 'users'
    });

    const query = builder.build();
    expect(query).toContain('select * from "users"');
  });

  it('должен создавать SELECT с указанными колонками', () => {
    const builder = new SelectQueryBuilder(knexInstance, {
      table: 'users',
      columns: ['id', 'name', 'email']
    });

    const query = builder.build();
    expect(query).toContain('select "id", "name", "email" from "users"');
  });

  it('должен добавлять условие WHERE', () => {
    const builder = new SelectQueryBuilder(knexInstance, {
      table: 'users',
      where: (qb) => qb.where('id', '=', 1)
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('select * from "users" where "id" = ?');
    expect(bindings).toEqual([1]);
  });

  it('должен добавлять INNER JOIN', () => {
    const builder = new SelectQueryBuilder(knexInstance, {
      table: 'users',
      joins: [
        {
          type: 'inner',
          table: 'orders',
          on: ['users.id', '=', 'orders.user_id']
        }
      ]
    });

    const query = builder.build();
    expect(query).toContain('inner join "orders" on "users"."id" = "orders"."user_id"');
  });

  it('должен добавлять LEFT JOIN', () => {
    const builder = new SelectQueryBuilder(knexInstance, {
      table: 'users',
      joins: [
        {
          type: 'left',
          table: 'orders',
          on: ['users.id', '=', 'orders.user_id']
        }
      ]
    });

    const query = builder.build();
    expect(query).toContain('left join "orders" on "users"."id" = "orders"."user_id"');
  });

  it('должен добавлять ORDER BY', () => {
    const builder = new SelectQueryBuilder(knexInstance, {
      table: 'users',
      orderBy: [{ column: 'created_at', direction: 'desc' }]
    });

    const query = builder.build();
    expect(query).toContain('order by "created_at" desc');
  });

  it('должен добавлять LIMIT и OFFSET', () => {
    const builder = new SelectQueryBuilder(knexInstance, {
      table: 'users',
      limit: 10,
      offset: 20
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('limit ? offset ?');
    expect(bindings).toEqual([10, 20]);
  });

  it('должен работать со схемой', () => {
    const builder = new SelectQueryBuilder(knexInstance, {
      schema: 'public',
      table: 'users'
    });

    const query = builder.build();
    expect(query).toContain('select * from "public"."users"');
  });
}); 
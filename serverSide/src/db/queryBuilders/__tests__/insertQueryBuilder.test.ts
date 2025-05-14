import { describe, it, expect, beforeEach } from 'vitest';
import { InsertQueryBuilder } from '../insertQueryBuilder';
import knex from 'knex';

describe('InsertQueryBuilder', () => {
  let knexInstance: any;

  beforeEach(() => {
    knexInstance = knex({ client: 'pg' });
  });

  it('должен создавать базовый INSERT запрос', () => {
    const builder = new InsertQueryBuilder(knexInstance, {
      table: 'users',
      values: [{ name: 'John', email: 'john@example.com' }]
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('insert into "users"');
    expect(sql).toContain('"name"');
    expect(sql).toContain('"email"');
    expect(sql).toContain('values (?, ?)');
    expect(bindings).toContain('John');
    expect(bindings).toContain('john@example.com');
    expect(bindings).toHaveLength(2);
  });

  it('должен создавать INSERT с множественными значениями', () => {
    const builder = new InsertQueryBuilder(knexInstance, {
      table: 'users',
      values: [
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane', email: 'jane@example.com' }
      ]
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('insert into "users"');
    expect(sql).toContain('"name"');
    expect(sql).toContain('"email"');
    expect(sql).toContain('values (?, ?), (?, ?)');
    expect(bindings).toContain('John');
    expect(bindings).toContain('john@example.com');
    expect(bindings).toContain('Jane');
    expect(bindings).toContain('jane@example.com');
    expect(bindings).toHaveLength(4);
  });

  it('должен корректно обрабатывать null значения', () => {
    const builder = new InsertQueryBuilder(knexInstance, {
      table: 'users',
      values: [{ name: null, email: 'john@example.com' }]
    });

    const { sql, bindings } = builder.toSQL();
    expect(sql).toContain('insert into "users"');
    expect(sql).toContain('"name"');
    expect(sql).toContain('"email"');
    expect(sql).toContain('values (?, ?)');
    expect(bindings).toContain(null);
    expect(bindings).toContain('john@example.com');
  });

  it('должен работать со схемой', () => {
    const builder = new InsertQueryBuilder(knexInstance, {
      schema: 'public',
      table: 'users',
      values: [{ name: 'John', email: 'john@example.com' }]
    });

    const { sql } = builder.toSQL();
    expect(sql).toContain('insert into "public"."users"');
  });
}); 
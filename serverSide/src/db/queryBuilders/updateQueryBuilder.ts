import { Knex } from 'knex';
import { UpdateQuery, SqlResult } from './types';

export class UpdateQueryBuilder {
  private readonly knex: Knex;
  private readonly options: UpdateQuery;

  constructor(knex: Knex, options: UpdateQuery) {
    this.knex = knex;
    this.options = options;
  }

  public build(): string {
    const sqlQuery = this.toSQL();
    let finalSql = sqlQuery.sql;
    sqlQuery.bindings.forEach((value) => {
      finalSql = finalSql.replace('?', typeof value === 'string' ? `'${value}'` : value);
    });
    return finalSql;
  }

  public toSQL(): SqlResult {
    const {table, values, where, schema} = this.options;
    const query = schema
      ? this.knex(table).withSchema(schema).update(values)
      : this.knex(table).update(values);
    where(query);
    return query.toSQL();
  }
}

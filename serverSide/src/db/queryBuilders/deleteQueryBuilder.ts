import {Knex} from 'knex';
import { DeleteQuery, SqlResult } from './types';

export class DeleteQueryBuilder {
  private readonly knex: Knex;
  private readonly options: DeleteQuery;

  constructor(knex: Knex, options: DeleteQuery) {
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
    const {table, where, schema} = this.options;
    const query = schema
      ? this.knex(table).withSchema(schema).delete()
      : this.knex(table).delete();
    where(query);
    return query.toSQL();
  }
}

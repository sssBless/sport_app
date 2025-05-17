import {Knex} from 'knex';
import { InsertQuery, SqlResult } from './types';

export class InsertQueryBuilder {
  private readonly knex: Knex;
  private readonly options: InsertQuery;

  constructor(knex: Knex, options: InsertQuery) {
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
    const {table, values, schema, returning} = this.options;
    let query = schema
      ? this.knex(table).withSchema(schema).insert(values)
      : this.knex(table).insert(values);
      
    if (returning) {
      query = query.returning(returning);
    }
    
    return query.toSQL();
  }
}

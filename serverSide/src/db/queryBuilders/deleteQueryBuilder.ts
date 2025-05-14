import {Knex} from 'knex';
import {DeleteQuery, SqlResult} from './types';

export class DeleteQueryBuilder {
  private readonly knex: Knex;
  private readonly options: DeleteQuery;

  constructor(knex: Knex, options: DeleteQuery) {
    this.knex = knex;
    this.options = options;
  }

  public build(): string {
    return this.toSQL().sql;
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

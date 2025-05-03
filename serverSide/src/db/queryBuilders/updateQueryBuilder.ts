import {Knex} from 'knex';
import {UpdateQuery} from './types';

export class UpdateQueryBuilder {
  private readonly knex: Knex;
  private readonly options: UpdateQuery;

  constructor(knex: Knex, options: UpdateQuery) {
    this.knex = knex;
    this.options = options;
  }

  public build(): string {
    const {table, values, where} = this.options;
    const query = this.knex(table).update(values);
    where(query);
    return query.toSQL().sql;
  }
}

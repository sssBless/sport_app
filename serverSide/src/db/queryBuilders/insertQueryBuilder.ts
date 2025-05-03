import {Knex} from 'knex';
import {InsertQuery} from './types';

export class InsertQueryBuilder {
  private readonly knex: Knex;
  private readonly options: InsertQuery;

  constructor(knex: Knex, options: InsertQuery) {
    this.knex = knex;
    this.options = options;
  }
  public build(): string {
    const {table, values} = this.options;
    return this.knex(table).insert(values).toSQL().sql;
  }
}

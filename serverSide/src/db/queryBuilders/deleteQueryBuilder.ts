import {Knex} from 'knex';
import {DeleteQuery} from './types';

export class DeleteQueryBuilder {
  private readonly knex: Knex;
  private readonly options: DeleteQuery;

  constructor(knex: Knex, options: DeleteQuery) {
    this.knex = knex;
    this.options = options;
  }

  public build(): string {
    const {table, where} = this.options;
    const query = this.knex(table).delete();
    where(query);
    return query.toSQL().sql;
  }
}

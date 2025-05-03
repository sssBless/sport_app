import {Knex} from 'knex';
import {JoinTypes, SelectQuery} from './types';

export class SelectQueryBuilder {
  private readonly knex: Knex;
  private readonly options: SelectQuery;

  constructor(knex: Knex, options: SelectQuery) {
    this.knex = knex;
    this.options = options;
  }

  public build(): string {
    const {table, columns = ['*']} = this.options;

    let query = this.knex(table).select(columns);

    this.applyJoins(query);
    this.applyWhere(query);
    this.applyOrderBy(query);
    this.applyPagination(query);

    return query.toSQL().sql;
  }

  private applyJoins(query: Knex.QueryBuilder): void {
    const {joins} = this.options;
    if (!joins) return;

    joins.forEach(({table, on, type}) => {
      const method = this.getJoinMethod(type);
      const [col1, operator, col2] = on;
      query[method](table, col1, operator, col2);
    });
  }

  private applyWhere(query: Knex.QueryBuilder): void {
    const {where} = this.options;
    if (where) where(query);
  }

  private applyOrderBy(query: Knex.QueryBuilder): void {
    const {orderBy} = this.options;
    if (!orderBy) return;

    orderBy.forEach(({column, direction}) => {
      query.orderBy(column, direction);
    });
  }

  private applyPagination(query: Knex.QueryBuilder): void {
    const {limit, offset} = this.options;
    if (limit) query.limit(limit);
    if (offset) query.offset(offset);
  }

  private getJoinMethod(type?: string): JoinTypes {
    switch (type) {
      case 'left':
        return 'leftJoin';
      case 'right':
        return 'rightJoin';
      case 'full':
        return 'fullOuterJoin';
      default:
        return 'innerJoin';
    }
  }
}

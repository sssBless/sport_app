import {Condition} from './types';

export const eq =
  (column: string, value: any): Condition =>
  queryBuilder =>
    queryBuilder.where(column, '=', value);

export const neq =
  (column: string, value: any): Condition =>
  queryBuilder =>
    queryBuilder.where(column, '!=', value);

export const gt =
  (column: string, value: any): Condition =>
  queryBuilder =>
    queryBuilder.where(column, '>', value);

export const lt =
  (column: string, value: any): Condition =>
  queryBuilder =>
    queryBuilder.where(column, '<', value);

export const gte =
  (column: string, value: any): Condition =>
  queryBuilder =>
    queryBuilder.where(column, '>=', value);

export const lte =
  (column: string, value: any): Condition =>
  queryBuilder =>
    queryBuilder.where(column, '<=', value);

export const like =
  (column: string, pattern: string): Condition =>
  queryBuilder =>
    queryBuilder.where(column, 'like', pattern);

export const _in =
  (column: string, values: any[]): Condition =>
  queryBuilder =>
    queryBuilder.whereIn(column, values);

export const notIn =
  (column: string, values: any[]): Condition =>
  queryBuilder =>
    queryBuilder.whereNotIn(column, values);

export const isNull =
  (column: string): Condition =>
  queryBuilder =>
    queryBuilder.whereNull(column);

export const isNotNull =
  (column: string): Condition =>
  queryBuilder =>
    queryBuilder.whereNotNull(column);

export const between =
  (column: string, range: [any, any]): Condition =>
  queryBuilder =>
    queryBuilder.whereBetween(column, range);

export const and =
  (conditions: Condition[]): Condition =>
  queryBuilder =>
    queryBuilder.where(inner => conditions.forEach(c => c(inner)));

export const or =
  (conditions: Condition[]): Condition =>
  queryBuilder =>
    queryBuilder.where(function() {
      conditions.forEach((condition, index) => {
        if (index === 0) {
          condition(this);
        } else {
          this.orWhere(function() {
            condition(this);
          });
        }
      });
    });

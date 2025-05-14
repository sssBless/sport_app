import {Knex} from 'knex';

export type Condition = (queryBuilder: Knex.QueryBuilder) => void;

export type JoinTypes =
  | 'innerJoin'
  | 'leftJoin'
  | 'rightJoin'
  | 'fullOuterJoin';

export interface SqlResult {
  sql: string;
  bindings: readonly any[];
}

type JoinCondition = [string, string, string];

export interface UpdateQuery {
  table: string;
  schema?: string;
  values: Record<string, any>;
  where: Condition;
}

export interface DeleteQuery {
  table: string;
  schema?: string;
  where: Condition;
}

export interface SelectQuery {
  table: string;
  schema?: string;
  columns?: string[];
  where?: Condition;
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
  joins?: JoinOptions[];
}

export interface InsertQuery {
  table: string;
  schema?: string;
  values: Record<string, any>[];
}

interface JoinOptions {
  table: string;
  on: JoinCondition;
  type?: 'inner' | 'left' | 'right' | 'full';
}

interface OrderByClause {
  column: string;
  direction: 'asc' | 'desc';
}

import {Knex} from 'knex';
import {
  DeleteQuery,
  InsertQuery,
  SelectQuery,
  UpdateQuery,
} from './queryBuilders/types';

export type DatabaseType = 'postgres';

export type ProviderCreator = () => DatabaseProvider;

interface PoolConfig {
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface DatabaseConfig {
  type: DatabaseType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  pool?: PoolConfig;
}

export interface DatabaseProvider {
  connect(config: Omit<DatabaseConfig, 'type'>): Promise<void>;
  disconnect(): Promise<void>;
  select(knex: Knex, query: SelectQuery): Promise<any>;
  delete(knex: Knex, query: DeleteQuery): Promise<any>;
  update(knex: Knex, query: UpdateQuery): Promise<any>;
  insert(knex: Knex, query: InsertQuery): Promise<any>;
  query(sql: string, values?: any[]): Promise<any>;
}
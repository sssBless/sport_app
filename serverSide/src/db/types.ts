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
  select(): Promise<any>;
  delete(): Promise<any>;
  update(): Promise<any>;
  insert(): Promise<any>;
}
import {DatabaseConfig, DatabaseType} from './types';

export function getConnectionString(config: DatabaseConfig): string {
  const {type, user, password, host, port, database} = config;
  switch (type) {
    case 'postgres':
      return `postgres://${user}:${password}@${host}:${port}/${database}`;
    default:
      throw new Error(`Unsupported database type ${type} to connection string`);
  }
}

export function getKnexClientType(type: DatabaseType): string {
  if (type === 'postgres') return 'pg';
  // default clientType
  return 'pg';
}
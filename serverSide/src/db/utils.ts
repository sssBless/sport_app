import { DatabaseConfig } from './types';

export function getConnectionString(config: DatabaseConfig): string {
  const { type, user, password, host, port, database } = config;
  switch (type) {
    case 'postgres':
      return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}

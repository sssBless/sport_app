import {DatabaseConfig} from './src/db/types';

interface AppConfig {
  databases: Record<string, DatabaseConfig>;
}

export const config: AppConfig = {
  databases: {
    main: {
      type: 'postgres',
      host: '<host>',
      port: 5432,
      user: '<username>',
      password: '<password>',
      database: '<database_name>',
      pool: {
        min: 1,
        max: 4,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 2_000,
      },
    },
  },
};

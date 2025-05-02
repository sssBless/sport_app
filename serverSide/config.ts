import { DatabaseConfig } from './src/db/types';


interface AppConfig {
    databases: Record<string, DatabaseConfig>
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
    },
  }
};

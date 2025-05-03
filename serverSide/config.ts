import {DatabaseConfig} from './src/db/types';
import * as dotenv from 'dotenv';

dotenv.config();

interface AppConfig {
  databases: Record<string, DatabaseConfig>;
}

// Проверка обязательных переменных окружения
function getEnvVar(name: string, required = true): string {
  const value = process.env[name];
  if (required && (!value || value.trim() === '')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value!;
}

const PG_HOST = getEnvVar('PG_HOST');
const PG_PORT = Number(getEnvVar('PG_PORT'));
const PG_USER = getEnvVar('PG_USER');
const PG_PASSWORD = getEnvVar('PG_PASSWORD');
const PG_DATABASE = getEnvVar('PG_DATABASE');

if (isNaN(PG_PORT)) {
  throw new Error('PG_PORT must be a valid number');
}

export const config: AppConfig = {
  databases: {
    main: {
      type: 'postgres',
      host: PG_HOST,
      port: PG_PORT,
      user: PG_USER,
      password: PG_PASSWORD,
      database: PG_DATABASE,
      pool: {
        min: 1,
        max: 4,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 2_000,
      },
    },
  },
};

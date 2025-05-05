import * as dotenv from 'dotenv';
import {DatabaseConfig} from './src/db/types';

dotenv.config();

interface AppConfig {
  databases: Record<string, DatabaseConfig>;
}

/**
 * Получает переменную окружения с проверкой
 * @param name - Имя переменной
 * @param required - Обязательная ли переменная
 * @returns Значение переменной
 * @throws Error если переменная обязательная и не задана
 */
function getEnvVar(name: string, required = true): string {
  const value = process.env[name];

  if (required && !value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value?.trim() || '';
}

/**
 * Получает числовую переменную окружения
 * @param name - Имя переменной
 * @param defaultValue - Значение по умолчанию
 * @returns Числовое значение
 * @throws Error если значение не является числом
 */
function getNumericEnvVar(name: string, defaultValue?: number): number {
  const value = getEnvVar(name, defaultValue === undefined);

  if (!value && defaultValue !== undefined) {
    return defaultValue;
  }

  const numericValue = Number(value);

  if (isNaN(numericValue)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }

  return numericValue;
}

const PG_HOST = getEnvVar('PG_HOST');
const PG_PORT = getNumericEnvVar('PG_PORT');
const PG_USER = getEnvVar('PG_USER');
const PG_PASSWORD = getEnvVar('PG_PASSWORD');
const PG_DATABASE = getEnvVar('PG_DATABASE');

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
        min: getNumericEnvVar('PG_POOL_MIN', 1),
        max: getNumericEnvVar('PG_POOL_MAX', 4),
        idleTimeoutMillis: getNumericEnvVar('PG_POOL_IDLE_TIMEOUT', 30_000),
        connectionTimeoutMillis: getNumericEnvVar('PG_POOL_CONN_TIMEOUT', 2_000),
      },
    },
  },
};

if (!PG_HOST || !PG_USER || !PG_DATABASE) {
  throw new Error('Invalid PostgreSQL configuration');
}
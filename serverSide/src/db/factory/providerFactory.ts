import { PostgresProvider } from '../postgres/provider';
import { DatabaseProvider, DatabaseType } from '../types';

export class ProviderFactory {
  public static create(type: DatabaseType): DatabaseProvider {
    switch (type) {
      case 'postgres':
        return new PostgresProvider();
      default:
        throw new Error(`Unsupported DB type: ${type}`);
    }
  }
}

import { PostgresProvider } from '../postgres/provider';
import { DatabaseProvider, DatabaseType, ProviderCreator } from '../types';

export class ProviderFactory {
  private static providerCreators: Record<DatabaseType, ProviderCreator> = {
    postgres: () => new PostgresProvider(),
  };

  static create(type: DatabaseType): DatabaseProvider {
    const creator = this.providerCreators[type];

    if (!creator) throw new Error(`Unsupported database type: ${type}`);

    return creator();
  }

  static registerProvider(type: DatabaseType, creator: ProviderCreator): void {
    this.providerCreators[type] = creator;
  }
}

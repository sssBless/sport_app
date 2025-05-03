import {Knex, knex} from 'knex';
import {ProviderFactory} from './factory/providerFactory';
import {DatabaseConfig, DatabaseProvider} from './types';
import {getConnectionString, getKnexClientType} from './utils';

export class DatabaseWrapper {
  private provider: DatabaseProvider;
  private config: DatabaseConfig;
  private knexInstance: Knex;
  private isConnected = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.provider = ProviderFactory.create(config.type);
    this.knexInstance = knex({
      client: getKnexClientType(config.type),
      connection: {
        connectionString: getConnectionString(config),
      },
    });
  }

  public async connect(): Promise<void> {
    if (this.isConnected) return;

    await this.provider.connect(this.config);
    this.isConnected = true;
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    await this.provider.disconnect();
    this.isConnected = false;
  }

  public getKnex(): Knex {
    return this.knexInstance;
  }

  public getProvider(): DatabaseProvider {
    return this.provider;
  }
}

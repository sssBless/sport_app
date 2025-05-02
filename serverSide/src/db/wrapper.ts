import { ProviderFactory } from './factory/providerFactory';
import { DatabaseConfig, DatabaseProvider, DatabaseType } from './types';

export class DatabaseWrapper {
  private provider: DatabaseProvider;
  private config: DatabaseConfig;
  private isConnected = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.provider = ProviderFactory.create(config.type);
  }

  public async connect(): Promise<void> {
    if (this.isConnected) return;

    const { type, ...providerConfig } = this.config;

    await this.provider.connect(providerConfig);
    this.isConnected = true;
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    await this.provider.disconnect();
    this.isConnected = false;
  }

  public async select(): Promise<any> {
    await this.provider.select();
  }

  public async insert(): Promise<any> {
    await this.provider.insert();
  }
  public async update(): Promise<any> {
    await this.provider.update();
  }
  public async delete(): Promise<any> {
    await this.provider.delete();
  }

  public getDatabaseType(): DatabaseType {
    return this.config.type;
  }
}

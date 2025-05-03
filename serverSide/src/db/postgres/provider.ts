import { DatabaseConfig, DatabaseProvider } from '../types';
import { Pool } from 'pg';
import { getConnectionString } from '../utils';

export class PostgresProvider implements DatabaseProvider {
  private pool: Pool;
  private isConnected: boolean = false;

  constructor() {
    this.pool = new Pool({});
  }

  public async connect(config: DatabaseConfig): Promise<void> {
    if (this.isConnected) return;

    await this.disconnect();

    const poolSettings = config.pool ?? {
      min: 1,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    };

    this.pool = new Pool({
      connectionString: getConnectionString(config),
      ...poolSettings,
    });

    try {
      const client = await this.pool.connect();
      client.release();
      this.isConnected = true;
    } catch (err) {
      console.error('Connection error: ', err);
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    try {
      if (this.pool && !this.pool.ended) await this.pool.end();
      this.isConnected = false;
    } catch (err) {
      console.error('Disconnection error:', err);
      throw err;
    }
  }

  public select(): Promise<any> {
    throw new Error('Method not implemented.');
  }

  public delete(): Promise<any> {
    throw new Error('Method not implemented.');
  }

  public update(): Promise<any> {
    throw new Error('Method not implemented.');
  }

  public insert(): Promise<any> {
    throw new Error('Method not implemented.');
  }
}

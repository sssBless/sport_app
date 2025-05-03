import { DatabaseConfig } from '../types';
import { DatabaseWrapper } from '../wrapper';

export class DatabaseService {
  private static clients: Record<string, DatabaseWrapper> = {};

  public static registerClient(name: string, config: DatabaseConfig): void {
    this.clients[name] = new DatabaseWrapper(config);
  }

  public static getClient(name: string): DatabaseWrapper {
    const client = this.clients[name];

    if (!client) throw new Error(`No database registered with name: ${name}`);

    return client;
  }

  public static async disconnectAll(): Promise<void> {
    await Promise.all(Object.values(this.clients).map((db) => db.disconnect()));
  }
}

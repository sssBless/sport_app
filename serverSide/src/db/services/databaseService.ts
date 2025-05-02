import { config } from '../../../config';
import { DatabaseWrapper } from '../wrapper';

export class DatabaseService {
  private static instances: Map<string, DatabaseWrapper> = new Map();

  public static getClient(dbName: string): DatabaseWrapper {
    if (!this.instances.has(dbName)) {
      const dbConfig = config.databases[dbName];

      if (!dbConfig) throw new Error(`Database config '${dbName}' not found`);

      const db = new DatabaseWrapper(dbConfig);
      this.instances.set(dbName, db);

      db.connect().catch((err) => {
        console.error(`Failed to connect to ${dbName}: `, err);
      });
    }

    return this.instances.get(dbName)!;
  }

  public static async disconnectAll(): Promise<void> {
    for (const db of this.instances.values()) {
      await db.disconnect().catch(console.error);
    }
  }
}

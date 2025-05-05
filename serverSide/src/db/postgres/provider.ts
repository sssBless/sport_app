import {DatabaseConfig, DatabaseProvider} from '../types';
import {Pool} from 'pg';
import {getConnectionString} from '../utils';
import {Knex} from 'knex';
import {
  DeleteQuery,
  InsertQuery,
  SelectQuery,
  UpdateQuery,
} from '../queryBuilders/types';
import {SelectQueryBuilder} from '../queryBuilders/selectQueryBuilder';
import {DeleteQueryBuilder} from '../queryBuilders/deleteQueryBuilder';
import {UpdateQueryBuilder} from '../queryBuilders/updateQueryBuilder';
import {InsertQueryBuilder} from '../queryBuilders/insertQueryBuilder';

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

  public async select(knex: Knex, query: SelectQuery): Promise<any> {
    const sql = new SelectQueryBuilder(knex, query).build();

    return await this.pool.query(sql);
  }

  public async delete(knex: Knex, query: DeleteQuery): Promise<any> {
    const sql = new DeleteQueryBuilder(knex, query).build();

    return await this.pool.query(sql);
  }

  public async update(knex: Knex, query: UpdateQuery): Promise<any> {
    const sql = new UpdateQueryBuilder(knex, query).build();

    return await this.pool.query(sql);
  }

  public async insert(knex: Knex, query: InsertQuery): Promise<any> {
    const sql = new InsertQueryBuilder(knex, query).build();

    return await this.pool.query(sql);
  }
}

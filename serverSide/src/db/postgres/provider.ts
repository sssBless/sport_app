import {DatabaseConfig, DatabaseProvider} from '../types';
import {Pool, QueryResult} from 'pg';
import {getConnectionString} from '../utils';
import {Knex} from 'knex';
import {SelectQueryBuilder} from '../queryBuilders/selectQueryBuilder';
import {DeleteQueryBuilder} from '../queryBuilders/deleteQueryBuilder';
import {UpdateQueryBuilder} from '../queryBuilders/updateQueryBuilder';
import {InsertQueryBuilder} from '../queryBuilders/insertQueryBuilder';
import { SelectQuery, DeleteQuery, InsertQuery, UpdateQuery } from '../queryBuilders/types';


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
    const sqlQuery = new SelectQueryBuilder(knex, query).build();
    
    const result: QueryResult = await this.pool.query(sqlQuery);
    return result.rows;
  }

  public async delete(knex: Knex, query: DeleteQuery): Promise<any> {
    const sqlQuery = new DeleteQueryBuilder(knex, query).build();

    const result: QueryResult = await this.pool.query(sqlQuery);
    return result.rowCount;
  }

  public async update(knex: Knex, query: UpdateQuery): Promise<any> {
    const sqlQuery = new UpdateQueryBuilder(knex, query).build();
    const result: QueryResult = await this.pool.query(sqlQuery);
    return result.rowCount;
  }

  public async insert(knex: Knex, query: InsertQuery): Promise<any> {
    const sqlQuery = new InsertQueryBuilder(knex, query).build();
    const result: QueryResult = await this.pool.query(sqlQuery);
    return result.rows;
  }

  public async query(sql: string, values?: any[]): Promise<any> {
    return this.pool.query(sql, values);
  }
}

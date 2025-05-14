import { FastifyPluginAsync } from 'fastify';
import { eq } from '../db/queryBuilders/filters';
import { DatabaseService } from '../db/services/databaseService';
const SCHEMA = 'workout_app';

const exercisePlugin: FastifyPluginAsync = async (fastify) => {
  // Получение всех упражнений
  fastify.get('/exercises', async (req, reply) => {
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    const exercises = await databaseProvider.select(knex, {
      table: 'exercises',
      schema: SCHEMA,
      columns: ['*'],
      orderBy: [{ column: 'name', direction: 'asc' }]
    });
    return { exercises };
  });
};

export default exercisePlugin; 
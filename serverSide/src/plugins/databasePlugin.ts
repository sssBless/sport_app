import { FastifyPluginAsync } from 'fastify';
import { DatabaseService } from '../db/services/databaseService';
import { config } from '../../config';

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  DatabaseService.registerClient('main', config.databases.main);

  const client = DatabaseService.getClient('main');
  await client.connect();

  fastify.addHook('onClose', async () => {
    await DatabaseService.disconnectAll();
  });
};

export default databasePlugin;
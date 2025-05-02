import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { DatabaseWrapper } from '../db/wrapper';
import { DatabaseService } from '../db/services/databaseService';

declare module 'fastify' {
  interface FastifyInstance {
    databases: {
      main: DatabaseWrapper;
    };
  }
}

const databasePlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const mainDatabase = DatabaseService.getClient('main');
  await mainDatabase.connect();

  fastify.decorate('databases', { main: mainDatabase });

  fastify.addHook('onClose', async () => await DatabaseService.disconnectAll());
};

export default databasePlugin;

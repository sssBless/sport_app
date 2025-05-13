import Fastify from 'fastify';
import databasePlugin from './plugins/databasePlugin';
import socketPlugin from './plugins/socketPlugin';
import {DatabaseService} from './db/services/databaseService';
import sessionsPlugin from './plugins/sessionsPlugin';

const fastify = Fastify();

fastify.register(sessionsPlugin);
fastify.register(databasePlugin);
fastify.register(socketPlugin);

fastify.get('/', async (request, reply) => {
  const client = DatabaseService.getClient('main');

  const provider = client.getProvider();

  client.connect();

  return await provider.select(client.getKnex(), {table: 'users', schema: 'workout_app'});

});

const start = async () => {
  try {
    await fastify.listen({port: 3000});
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();

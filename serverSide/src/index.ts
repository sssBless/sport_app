import Fastify from 'fastify';
import databasePlugin from './plugins/databasePlugin';

const fastify = Fastify();

fastify.register(databasePlugin);

fastify.get('/', async (request, reply) => {
  return 'Hello world';
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

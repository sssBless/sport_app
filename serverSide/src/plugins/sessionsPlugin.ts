import {FastifyPluginAsync} from 'fastify';
import fastifyCookie from 'fastify-cookie';
import fastifyRedis from 'fastify-redis';
import Redis from 'ioredis';
import fastifySession from 'fastify-session';

const sessionsPlugin: FastifyPluginAsync = async fastify => {
  fastify.register(fastifyRedis, {
    client: new Redis(),
  });

  fastify.register(fastifyCookie);

  fastify.register(fastifySession, {
    secret: 'a_very_secret_key_that_is_long_enough',
    cookie: {
      secure: false,
      maxAge: 3600 * 1000, // 1 hour
    },
    store: {
      get: async (sid, callback) => {
        const data = await fastify.redis.get(`sess:${sid}`);
        callback(undefined, data ? JSON.parse(data) : null);
      },
      set: async (sid, sess, callback) => {
        await fastify.redis.setex(`sess:${sid}`, 3600, JSON.stringify(sess));
        callback(undefined);
      },
      destroy: async (sid, callback) => {
        await fastify.redis.del(`sess:${sid}`);
        callback(undefined);
      },
    },
  });
};

export default sessionsPlugin;

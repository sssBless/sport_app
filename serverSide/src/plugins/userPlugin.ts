import { FastifyPluginAsync } from 'fastify';
import { DatabaseService } from '../db/services/databaseService';
import { eq } from '../db/queryBuilders/filters';
import bcrypt from 'bcrypt';
const SCHEMA = 'workout_app';

const userPlugin: FastifyPluginAsync = async (fastify) => {
  // Регистрация
  fastify.post('/register', async (req, reply) => {
    const { username, password, display_name, email } = req.body as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Проверка на уникальность username/email
    const [exists] = await databaseProvider.select(knex, {
      table: 'users',
      schema: SCHEMA,
      columns: ['user_uuid'],
      where: eq('username', username)
    });
    if (exists) return reply.status(409).send({ error: 'Пользователь уже существует' });

    const hash = await bcrypt.hash(password, 10);
    const [user] = await databaseProvider.insert(knex, {
      table: 'users',
      schema: SCHEMA,
      values: [{
        username,
        password_hash: hash,
        display_name,
        email
      }]
    });
    return { user };
  });

  // Изменение пользователя
  fastify.patch('/user', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Не авторизован' });
    const { display_name, email, password } = req.body as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    const values: any = {};
    if (display_name) values.display_name = display_name;
    if (email) values.email = email;
    if (password) values.password_hash = await bcrypt.hash(password, 10);

    const [updated] = await databaseProvider.update(knex, {
      table: 'users',
      schema: SCHEMA,
      values,
      where: eq('user_uuid', user.uuid)
    });
    return { user: updated };
  });

  // Удаление пользователя
  fastify.delete('/user', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Не авторизован' });
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    await databaseProvider.delete(knex, {
      table: 'users',
      schema: SCHEMA,
      where: eq('user_uuid', user.uuid)
    });
    return { ok: true };
  });
};

export default userPlugin; 
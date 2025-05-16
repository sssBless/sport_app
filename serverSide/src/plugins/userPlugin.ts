import { FastifyPluginAsync } from 'fastify';
import { DatabaseService } from '../db/services/databaseService';
import { eq } from '../db/queryBuilders/filters';
import bcrypt from 'bcrypt';
import { AuthenticatedFastifyInstance } from '../../types/fastify';

const SCHEMA = 'workout_app';

const userPlugin: FastifyPluginAsync = async (fastify: AuthenticatedFastifyInstance) => {
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
    console.log('=== PATCH /user - START ===');
    console.log('Headers:', req.headers);
    console.log('Cookies:', req.cookies);
    console.log('User from request:', req.user);
    
    // Если req.user не установлен, получаем пользователя вручную из токена
    if (!req.user) {
      console.log('User not set, trying to get user manually from token');
      const authToken = req.cookies.auth_token || 
                     req.headers.authorization?.replace('Bearer ', '');
                       
      if (!authToken) {
        return reply.status(401).send({ error: 'Не авторизован - токен отсутствует' });
      }
      
      // Получаем AuthStore из глобального экземпляра
      const authStore = (fastify as any).authStore || 
                       (global as any).authStore ||
                       require('../services/AuthStore').AuthStore.getInstance();
                       
      if (!authStore) {
        console.log('ERROR: Cannot access AuthStore instance');
        return reply.status(500).send({ error: 'Внутренняя ошибка сервера - хранилище аутентификации недоступно' });
      }
      
      const user = authStore.getUser(authToken);
      if (!user) {
        console.log('User not found for token', authToken.substring(0, 5) + '...');
        return reply.status(401).send({ error: 'Сессия истекла или недействительна' });
      }
      
      console.log('Found user manually:', user);
      req.user = {
        uuid: user.uuid,
        username: user.username
      };
    }
    
    const user = req.user!;
    console.log('Authenticated user:', user);
    
    console.log('UPDATE USER REQUEST:', {
      body: req.body,
      user: user,
      headers: req.headers,
      cookies: req.cookies
    });
    
    const { display_name, email, current_password, new_password } = req.body as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    // Получаем текущего пользователя для проверки пароля
    const [currentUser] = await databaseProvider.select(knex, {
      table: 'users',
      schema: SCHEMA,
      columns: ['*'],
      where: eq('user_uuid', user.uuid)
    });
    
    if (!currentUser) {
      console.log('USER NOT FOUND:', user.uuid);
      return reply.status(404).send({ error: 'Пользователь не найден' });
    }

    const values: Record<string, any> = {};
    if (display_name) values.display_name = display_name;
    if (email) values.email = email;
    
    // Если пришел запрос на изменение пароля
    if (current_password && new_password) {
      // Проверяем текущий пароль
      const isPasswordValid = await bcrypt.compare(current_password, currentUser.password_hash);
      if (!isPasswordValid) {
        console.log('INVALID CURRENT PASSWORD');
        return reply.status(400).send({ error: 'Неверный текущий пароль' });
      }
      
      // Хешируем и сохраняем новый пароль
      values.password_hash = await bcrypt.hash(new_password, 10);
    }
    
    // Если нет изменений, сразу возвращаем успех
    if (Object.keys(values).length === 0) {
      return { user: currentUser };
    }
    
    console.log('UPDATING USER:', {
      values: values,
      uuid: user.uuid
    });

    try {
      // update возвращает количество обновленных строк, а не сами данные
      const rowCount = await databaseProvider.update(knex, {
        table: 'users',
        schema: SCHEMA,
        values,
        where: eq('user_uuid', user.uuid)
      });
      
      if (rowCount === 0) {
        return reply.status(404).send({ error: 'Пользователь не найден или не обновлен' });
      }
      
      // Получаем обновленного пользователя
      const [updatedUser] = await databaseProvider.select(knex, {
        table: 'users',
        schema: SCHEMA,
        columns: ['user_uuid', 'username', 'display_name', 'email', 'created_at'],
        where: eq('user_uuid', user.uuid)
      });
      
      console.log('=== PATCH /user - END ===');
      return { user: updatedUser };
    } catch (error) {
      console.error('Error updating user:', error);
      return reply.status(500).send({ error: 'Ошибка обновления пользователя' });
    }
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

  // Получение информации о пользователе по uuid
  fastify.get('/user/:uuid', async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    
    console.log('GET USER BY UUID:', uuid);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    try {
      const [user] = await databaseProvider.select(knex, {
        table: 'users',
        schema: SCHEMA,
        columns: ['user_uuid', 'username', 'display_name', 'email', 'created_at'],
        where: eq('user_uuid', uuid)
      });

      if (!user) {
        return reply.status(404).send({ error: 'Пользователь не найден' });
      }

      return {
        uuid: user.user_uuid,
        username: user.username,
        display_name: user.display_name || user.username,
        email: user.email,
        created_at: user.created_at
      };
    } catch (error) {
      console.error('Error fetching user by UUID:', error);
      return reply.status(500).send({ error: 'Ошибка сервера' });
    }
  });
};

export default userPlugin; 
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { DatabaseService } from '../db/services/databaseService';
import { AuthStore } from '../services/AuthStore';
import bcrypt from 'bcrypt';
import { eq } from '../db/queryBuilders/filters';

// Интерфейс для публичного маршрута
interface PublicRoute {
  method: string;
  url: string;
}

// Список публичных маршрутов
const publicRoutes: PublicRoute[] = [
  { method: 'POST', url: '/auth/login' },
  { method: 'POST', url: '/auth/logout' }
];

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const authStore = AuthStore.getInstance();

  // Запускаем периодическую очистку устаревших записей
  setInterval(() => {
    authStore.cleanup();
  }, 60 * 60 * 1000); // Каждый час

  // Функция проверки авторизации
  const validateAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.cookies.auth_token || 
                     request.headers.authorization?.replace('Bearer ', '');
    
    if (!signature) {
      reply.status(401).send({ error: 'Не авторизован' });
      return false;
    }

    const user = authStore.getUser(signature);
    if (!user) {
      reply.status(401).send({ error: 'Сессия истекла' });
      return false;
    }

    const clientInfo = {
      userAgent: request.headers['user-agent'] || '',
      ip: request.ip
    };

    if (!authStore.validateSignature(signature, clientInfo)) {
      reply.status(401).send({ error: 'Недействительная подпись' });
      return false;
    }

    return true;
  };

  // Глобальный хук для проверки авторизации
  fastify.addHook('onRequest', async (request, reply) => {
    // Проверяем, является ли маршрут публичным
    const isPublicRoute = publicRoutes.some(route => 
      route.method === request.method && 
      route.url === request.routeOptions.url
    );

    if (!isPublicRoute) {
      const isValid = await validateAuth(request, reply);
      if (!isValid) {
        return reply;
      }
    }
  });

  // Маршрут для входа
  fastify.post('/auth/login', async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };
    
    const db = DatabaseService.getClient('main');
    
    const query = {
      table: 'users',
      schema: 'workout_app',
      columns: ['*'],
      where: eq('username', username),
      limit: 1
    };

    const user = (await db.getProvider().select(db.getKnex(), query))[0];
  
    if (!user) {
      return reply.status(401).send({ error: 'Неверные учетные данные' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return reply.status(401).send({ error: 'Неверные учетные данные' });
    }

    const clientInfo = {
      userAgent: request.headers['user-agent'] || '',
      ip: request.ip
    };
    
    const signature = authStore.addUser(user.user_uuid, user.username, clientInfo);
    
    // Устанавливаем токен в httpOnly cookie
    reply.setCookie('auth_token', signature, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 // 24 часа
    });
    
    return { 
      success: true,
      user: {
        uuid: user.user_uuid,
        username: user.username
      }
    };
  });

  // Маршрут для выхода
  fastify.post('/auth/logout', async (request, reply) => {
    const signature = request.cookies.auth_token || 
                     request.headers.authorization?.replace('Bearer ', '');
    if (signature) {
      authStore.removeUser(signature);
      reply.clearCookie('auth_token', {
        path: '/'
      });
    }
    return { success: true };
  });

  // Маршрут для проверки текущего пользователя
  fastify.get('/auth/me', async (request, reply) => {
    const signature = request.headers.authorization?.replace('Bearer ', '');
    
    if (!signature) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const user = authStore.getUser(signature);
    
    if (!user) {
      return reply.status(401).send({ error: 'Сессия истекла' });
    }

    const clientInfo = {
      userAgent: request.headers['user-agent'] || '',
      ip: request.ip
    };

    if (!authStore.validateSignature(signature, clientInfo)) {
      return reply.status(401).send({ error: 'Недействительная подпись' });
    }

    return {
      uuid: user.uuid,
      username: user.username
    };
  });

  fastify.decorate('authenticate', validateAuth);
};

export default authPlugin; 
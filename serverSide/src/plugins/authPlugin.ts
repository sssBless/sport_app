import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { DatabaseService } from '../db/services/databaseService';
import { AuthStore } from '../services/AuthStore';
import bcrypt from 'bcrypt';
import { eq } from '../db/queryBuilders/filters';
import { AuthenticatedFastifyInstance } from '../../types/fastify';

// Интерфейс для публичного маршрута
interface PublicRoute {
  method: string;
  url: string;
}

// Список публичных маршрутов
const publicRoutes: PublicRoute[] = [
  { method: 'POST', url: '/auth/login' },
  { method: 'POST', url: '/auth/logout' },
  { method: 'GET', url: '/auth/me' }
];

const authPlugin: FastifyPluginAsync = async (fastify: AuthenticatedFastifyInstance) => {
  const authStore = AuthStore.getInstance();

  // Сохраняем authStore как глобальный декоратор для доступа из других плагинов
  fastify.decorate('authStore', authStore);
  
  // Также сохраняем в глобальной области для доступа из любого места
  (global as any).authStore = authStore;

  // Декорируем fastify именем плагина
  fastify.decorate('authPlugin', true);

  // Добавляем промежуточное ПО для CORS заголовков
  fastify.addHook('onRequest', (request, reply, done) => {
    reply.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    reply.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    reply.header('Access-Control-Allow-Credentials', 'true');
    
    // Обработка preflight запросов
    if (request.method === 'OPTIONS') {
      reply.send();
      return;
    }
    
    done();
  });

  // Запускаем периодическую очистку устаревших записей
  setInterval(() => {
    authStore.cleanup();
  }, 60 * 60 * 1000); // Каждый час

  // Декорируем fastify функцией аутентификации
  fastify.decorate('authenticate', async function(this: AuthenticatedFastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    console.log('=== Authenticate middleware - start ===');
    console.log('Original URL:', request.url);
    console.log('Raw URL:', request.raw.url);
    console.log('Route info:', {
      url: (request.routeOptions as any)?.url,
      prefix: (request.routeOptions as any)?.prefix,
      prefixed: (request.routeOptions as any)?.config
    });
    console.log('Request method:', request.method);
    console.log('Request body:', request.body);
    console.log('Request raw headers:', request.raw.headers);
    
    // Извлекаем токен из cookie или заголовка Authorization
    const cookieToken = request.cookies.auth_token;
    const headerAuth = request.headers.authorization;
    const headerToken = headerAuth?.replace('Bearer ', '');
    
    console.log('Auth tokens found:', {
      cookieToken: cookieToken ? `Found (${cookieToken.substring(0, 5)}...)` : 'Not found',
      headerAuth: headerAuth ? `Found (${headerAuth.substring(0, 15)}...)` : 'Not found',
      headerToken: headerToken ? `Found (${headerToken.substring(0, 5)}...)` : 'Not found'
    });
    
    // Используем токен из заголовка, если он есть, иначе из cookie
    const signature = headerToken || cookieToken;
    
    console.log('Using signature:', signature ? `${signature.substring(0, 5)}...` : 'None');
    
    if (!signature) {
      console.log('No signature found');
      reply.status(401).send({ error: 'Не авторизован' });
      return false;
    }

    const user = authStore.getUser(signature);
    console.log('Found user in AuthStore:', user ? {
      uuid: user.uuid,
      username: user.username
    } : 'null');
    
    if (!user) {
      console.log('User not found for signature:', signature.substring(0, 5) + '...');
      console.log('Auth store debug info:', authStore.debugStore());
      console.log('Available signatures:', authStore.getAllUsers().map(u => ({ 
        username: u.username,
        signature: u.signature.substring(0, 5) + '...'
      })));
      reply.status(401).send({ error: 'Сессия истекла' });
      return false;
    }

    const clientInfo = {
      userAgent: request.headers['user-agent'] || '',
      ip: request.ip
    };

    console.log('Client info:', clientInfo);
    
    const isValidSignature = authStore.validateSignature(signature, clientInfo);
    console.log('Signature validation result:', isValidSignature);

    if (!isValidSignature) {
      console.log('Invalid signature:', signature.substring(0, 5) + '...');
      reply.status(401).send({ error: 'Недействительная подпись' });
      return false;
    }

    console.log('Authentication successful for user:', user.username);
    
    // Устанавливаем пользователя как свойство запроса
    request.user = {
      uuid: user.uuid,
      username: user.username
    };
    
    console.log('User set in request:', request.user);
    
    // Проверяем, что user действительно установлен
    if (!request.user) {
      console.error('ERROR: Failed to set user in request object despite successful authentication');
      reply.status(500).send({ error: 'Внутренняя ошибка сервера - ошибка аутентификации' });
      return false;
    }
    
    console.log('=== Authenticate middleware - end ===');

    return true;
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
      signature,
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
    const signature = request.cookies.auth_token || 
                     request.headers.authorization?.replace('Bearer ', '');
    
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
      username: user.username,
      signature
    };
  });
};

export default authPlugin; 
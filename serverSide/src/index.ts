import fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import databasePlugin from './plugins/databasePlugin';
import socketPlugin from './plugins/socketPlugin';
import authPlugin from './plugins/authPlugin';
import workoutPlugin from './plugins/workoutPlugin';
import userPlugin from './plugins/userPlugin';
import exercisePlugin from './plugins/exercisePlugin';
import { AuthStore } from './services/AuthStore';
import { initialize } from './db/initialize';
import notificationPlugin from './plugins/notificationPlugin';
import notificationRoutes from './routes/notificationRoutes';

// Создаем экземпляр fastify с базовым логгером
const app = fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
    },
  },
  disableRequestLogging: true,
});

// Регистрируем CORS
app.register(cors, {
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['set-cookie'],
  methods: ['GET', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS']
});

// Регистрируем поддержку cookie
app.register(cookie, {
  secret: process.env.COOKIE_SECRET || 'your-secret-key', // В продакшене использовать безопасный секрет
  hook: 'onRequest',
});

// Проверяем, что в запросе есть токен, и если есть - пытаемся восстановить сессию
app.addHook('onRequest', async (request, reply) => {
  const cookieToken = request.cookies.auth_token;
  const headerAuth = request.headers.authorization;
  const headerToken = headerAuth?.replace('Bearer ', '');
  const token = headerToken || cookieToken;
  
  const url = request.url;
  const method = request.method;
  
  console.log(`[Server] ${method} ${url} - Token: ${token ? 'Present' : 'None'}`);
  
  if (token) {
    // Не выходим с ошибкой, просто логируем для дебага
    console.log(`[Server] Auth token present in ${cookieToken ? 'cookie' : 'header'}`);
  }
});

const start = async () => {
  try {
    // Инициализируем синглтон AuthStore
    const authStore = AuthStore.getInstance();
    
    // Добавляем поддержку JSON в теле запроса
    app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
      try {
        const json = JSON.parse(body as string);
        done(null, json);
      } catch (err) {
        done(err as Error);
      }
    });

    console.log('[Server] Регистрация базовых плагинов...');
    
    // Сначала регистрируем базовые плагины в правильном порядке
    await app.register(databasePlugin);
    console.log('[Server] База данных инициализирована');
    
    // Подключение к БД
    await initialize();
    console.log('[Server] База данных подключена');
    
    // Регистрируем socketPlugin, который создаст сервер Socket.IO - должен быть ПЕРЕД всеми плагинами, использующими сокеты
    await app.register(socketPlugin);
    console.log('[Server] Socket.IO плагин зарегистрирован');
    
    // Небольшая задержка для завершения регистрации Socket.IO
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Проверяем, что декораторы созданы правильно - ПОСЛЕ регистрации socketPlugin
    if (!app.hasDecorator('io')) {
      console.error('[Server] ОШИБКА: Декоратор io не зарегистрирован!');
    } else {
      console.log('[Server] Декоратор io успешно зарегистрирован');
    }
    
    if (!app.hasDecorator('notificationService')) {
      console.error('[Server] ОШИБКА: Декоратор notificationService не зарегистрирован!');
    } else {
      console.log('[Server] Декоратор notificationService успешно зарегистрирован');
    }

    // Важно: сначала регистрируем плагины, которые не используют notificationService
    await app.register(authPlugin);
    await app.register(authPlugin, { prefix: '/api' });
    
    // Затем регистрируем новый объединенный notificationPlugin
    await app.register(notificationPlugin);
    await app.register(notificationPlugin, { prefix: '/api' });
    console.log('[Server] Плагин уведомлений и приглашений зарегистрирован');
    
    await app.register(notificationRoutes);
    await app.register(notificationRoutes, { prefix: '/api' });
    console.log('[Server] Маршруты уведомлений зарегистрированы');
    
    // Добавляем middleware для восстановления пользователя из токена
    app.addHook('preHandler', async (request, reply) => {
      // Проверяем, что user еще не установлен и есть токен
      if (!request.user && (request.headers.authorization || request.cookies.auth_token)) {
        console.log('[Server] preHandler: восстановление пользователя из токена');
        
        const token = request.cookies.auth_token || 
                     request.headers.authorization?.replace('Bearer ', '');
        
        if (token) {
          // Получаем authStore из глобального хранилища или из Fastify instance
          const authStore = AuthStore.getInstance();
          
          if (authStore) {
            const user = authStore.getUser(token);
            
            if (user) {
              // Устанавливаем пользователя в request
              request.user = {
                uuid: user.uuid,
                username: user.username
              };
              
              console.log(`[Server] Пользователь успешно восстановлен: ${user.username}`);
              
              // Обновляем токен в cookies на всякий случай
              reply.setCookie('auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/',
                maxAge: 24 * 60 * 60 // 24 часа
              });
            } else {
              console.log('[Server] Не удалось найти пользователя для токена');
              
              // Очищаем невалидный токен
              reply.clearCookie('auth_token', { path: '/' });
            }
          }
        }
      }
    });
    
    // Регистрируем остальные плагины API с префиксом /api
    await app.register(workoutPlugin, { prefix: '/api' });
    await app.register(userPlugin, { prefix: '/api' });
    await app.register(exercisePlugin, { prefix: '/api' });
    
    // Запускаем сервер
    await app.ready();
    
    // Запускаем сервер на одном порту
    await app.listen({ port: 3000, host: '0.0.0.0' });
    
    console.log('Сервер запущен на порту 3000');
  } catch (err) {
    console.error('Ошибка при запуске сервера:', err);
    process.exit(1);
  }
};

start();

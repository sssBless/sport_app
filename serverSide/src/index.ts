import path from 'path';
import fs from 'fs';
import fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import databasePlugin from './plugins/databasePlugin';
import socketPlugin from './plugins/socketPlugin';
import authPlugin from './plugins/authPlugin';
import workoutPlugin from './plugins/workoutPlugin';
import participantPlugin from './plugins/participantPlugin';
import userPlugin from './plugins/userPlugin';
import exercisePlugin from './plugins/exercisePlugin';
import { DatabaseService } from './db/services/databaseService';

const app = fastify();

// Регистрируем CORS
app.register(cors, {
  origin: 'http://localhost:5173',
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

// Применение миграций при запуске
const applyMigrations = async () => {
  console.log('Applying database migrations...');
  
  try {
    const migrationPath = path.join(__dirname, 'db', 'migrations', 'update_workout_exercises.sql');
    
    // Проверяем, существует ли файл миграции
    if (fs.existsSync(migrationPath)) {
      console.log('Found migration file:', migrationPath);
      
      // Читаем файл миграции
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      
      // Выполняем SQL-запросы из файла миграции
      console.log('Executing migration...');
      
      // Получаем клиент базы данных и выполняем миграцию
      // Обратите внимание: это работает только после инициализации БД через databasePlugin
      setTimeout(async () => {
        try {
          const dbClient = (app as any).db;
          if (dbClient && dbClient.knex) {
            await dbClient.knex.raw(migrationSql);
            console.log('Migration applied successfully');
          } else {
            console.log('Database client not available yet, migration will be skipped');
          }
        } catch (err) {
          console.error('Error executing migration:', err);
        }
      }, 3000); // Даем время на инициализацию БД
    } else {
      console.log('No migration file found at:', migrationPath);
    }
  } catch (error) {
    console.error('Error applying migrations:', error);
    // Продолжаем запуск даже при ошибке миграции
  }
};

const start = async () => {
  try {
    // Добавляем поддержку JSON в теле запроса
    app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
      try {
        const json = JSON.parse(body as string);
        done(null, json);
      } catch (err) {
        done(err as Error);
      }
    });
    
    // Сначала регистрируем базовые плагины
    await app.register(databasePlugin);
    await app.register(socketPlugin);
    
    // Регистрируем authPlugin глобально без префикса (для core auth routes)
    await app.register(authPlugin);
    
    // Добавляем middleware для восстановления пользователя из токена
    app.addHook('preHandler', async (request, reply) => {
      if (!request.user && (request.headers.authorization || request.cookies.auth_token)) {
        console.log('Global preHandler: attempting to restore user from token');
        const authStore = (app as any).authStore;
        if (authStore) {
          const token = request.cookies.auth_token || 
                       request.headers.authorization?.replace('Bearer ', '');
          if (token) {
            const user = authStore.getUser(token);
            if (user) {
              request.user = {
                uuid: user.uuid,
                username: user.username
              };
              console.log('Global preHandler: user restored', request.user);
            }
          }
        }
      }
    });
    
    // После того как authPlugin загружен, регистрируем плагины API с префиксом
    await app.register(workoutPlugin, { prefix: '/api' });
    await app.register(participantPlugin, { prefix: '/api' });
    await app.register(userPlugin, { prefix: '/api' });
    await app.register(exercisePlugin, { prefix: '/api' });
    
    // Применяем миграции после инициализации всех плагинов
    applyMigrations();

    await app.listen({ port: 3000, host: '127.0.0.1' });
    console.log('Server is running on http://127.0.0.1:3000');
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

start();

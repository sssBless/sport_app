import fastify from 'fastify';
import cookie from '@fastify/cookie';
import databasePlugin from './plugins/databasePlugin';
import socketPlugin from './plugins/socketPlugin';
import authPlugin from './plugins/authPlugin';
import workoutPlugin from './plugins/workoutPlugin';

const app = fastify();

// Регистрируем поддержку cookie
app.register(cookie, {
  secret: process.env.COOKIE_SECRET || 'your-secret-key', // В продакшене использовать безопасный секрет
  hook: 'onRequest',
});

app.register(databasePlugin);
app.register(socketPlugin);
app.register(authPlugin);
app.register(workoutPlugin);

// Добавляем поддержку JSON в теле запроса
app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    const json = JSON.parse(body as string);
    done(null, json);
  } catch (err) {
    done(err as Error);
  }
});

const start = async () => {
  try {
    await app.listen({ port: 3000, host: '127.0.0.1' });
    console.log('Server is running on http://127.0.0.1:3000');
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

start();

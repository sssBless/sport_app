import { FastifyPluginAsync } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { NotificationService } from '../sockets/services/notificationService';

// Указываем, что этот плагин экспортирует декораторы
export interface SocketPluginOptions {
  // Пустой объект для опций
}

const socketPlugin: FastifyPluginAsync<SocketPluginOptions> = async (fastify, options) => {
  console.log('[SocketPlugin] Инициализация socketPlugin - начало');
  
  // Проверяем, не были ли уже зарегистрированы декораторы
  if (fastify.hasDecorator('io') || fastify.hasDecorator('notificationService')) {
    console.warn('[SocketPlugin] ВНИМАНИЕ: Декораторы io или notificationService уже зарегистрированы');
  }

  try {
    // Настраиваем сервер Socket.IO с улучшенными настройками CORS
    const io = new SocketIOServer(fastify.server, {
      cors: {
        origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'],
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
      },
      path: '/socket.io', // Стандартный путь для Socket.IO
      serveClient: false, // Не обслуживаем клиентский JS
      pingTimeout: 60000, // Увеличиваем таймаут для стабильности соединения
      pingInterval: 25000, // Интервал проверки соединения
      connectTimeout: 45000, // Увеличенный тайм-аут подключения
      transports: ['websocket', 'polling'], // Поддерживаемые транспорты
      allowUpgrades: true // Разрешаем обновление транспорта
    });

    // Расширенное логирование для отладки
    fastify.log.info(`Socket.IO инициализирован с настройками:
      - path: ${io.path()}
      - pingTimeout: ${io._opts.pingTimeout}
      - pingInterval: ${io._opts.pingInterval}
    `);

    // Добавляем общие обработчики для отладки
    io.on('connection', (socket) => {
      console.log(`[SocketIO] Новое подключение: ${socket.id}`);
      console.log(`[SocketIO] Транспорт соединения: ${socket.conn.transport.name}`);
      console.log(`[SocketIO] Запрос с адреса: ${socket.handshake.address}`);
      console.log(`[SocketIO] User-Agent: ${socket.handshake.headers['user-agent']}`);
      
      // Отправляем приветственное сообщение для проверки соединения
      socket.emit('welcome', { 
        message: 'Соединение с сервером установлено',
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
      
      socket.on('disconnect', (reason) => {
        console.log(`[SocketIO] Отключение ${socket.id}: ${reason}`);
      });
      
      socket.on('error', (error) => {
        console.error(`[SocketIO] Ошибка сокета ${socket.id}:`, error);
      });
    });

    // Отслеживаем общие события для всего сервера
    io.engine.on('connection_error', (err) => {
      console.error(`[SocketIO:Engine] Ошибка подключения: ${err.message}`);
      console.error(`[SocketIO:Engine] Причина: ${err.code}`);
      if (err.context) {
        console.error(`[SocketIO:Engine] Контекст:`, err.context);
      }
    });

    console.log('[SocketPlugin] Создание экземпляра NotificationService...');
    const notificationService = new NotificationService(io);
    console.log('[SocketPlugin] Экземпляр NotificationService успешно создан');

    // Регистрируем декораторы fastify
    console.log('[SocketPlugin] Регистрация декоратора io...');
    fastify.decorate('io', io);
    console.log('[SocketPlugin] Декоратор io зарегистрирован');
    
    console.log('[SocketPlugin] Регистрация декоратора notificationService...');
    fastify.decorate('notificationService', notificationService);
    console.log('[SocketPlugin] Декоратор notificationService зарегистрирован');
    
    // Важно: сохраняем ссылки на io и notificationService в глобальных переменных
    // Это обеспечит доступность декораторов для всех плагинов
    (global as any).socketIO = io;
    (global as any).notificationServiceInstance = notificationService;
    
    // Проверяем, что декораторы действительно зарегистрированы
    if (fastify.hasDecorator('io')) {
      console.log('[SocketPlugin] Проверка: декоратор io существует');
    } else {
      console.error('[SocketPlugin] ОШИБКА: декоратор io НЕ зарегистрирован!');
    }
    
    if (fastify.hasDecorator('notificationService')) {
      console.log('[SocketPlugin] Проверка: декоратор notificationService существует');
    } else {
      console.error('[SocketPlugin] ОШИБКА: декоратор notificationService НЕ зарегистрирован!');
    }
    
    // Настраиваем периодическую проверку соединений
    const diagInterval = setInterval(() => {
      const sockets = io.sockets.sockets;
      const socketCount = Object.keys(sockets).length;
      console.log(`[SocketIO:Diag] Активные соединения: ${socketCount}`);
      
      if (socketCount > 0) {
        // Выборочно проверяем некоторые сокеты
        Object.values(sockets).slice(0, 5).forEach(socket => {
          console.log(`[SocketIO:Diag] Сокет ${socket.id}: подключен=${socket.connected}, транспорт=${socket.conn.transport.name}`);
        });
      }
    }, 60000); // Проверка каждую минуту

    // Очищаем ресурсы при закрытии сервера
    fastify.addHook('onClose', (instance, done) => {
      clearInterval(diagInterval);
      io.close(() => {
        console.log('[SocketIO] Сервер Socket.IO закрыт');
        done();
      });
    });
    
    fastify.log.info('Socket.IO сервер инициализирован');
    console.log('[SocketPlugin] Инициализация socketPlugin - завершена');
    
  } catch (error) {
    console.error('[SocketPlugin] Критическая ошибка при инициализации Socket.IO:', error);
    throw error; // Пробрасываем ошибку дальше для корректной обработки
  }
};

// Комментируем метаданные, вызывающие ошибки типизации
// socketPlugin[Symbol.for('fastify.display-name')] = 'socket-io-plugin';
// socketPlugin[Symbol.for('skip-override')] = true;

export default socketPlugin;

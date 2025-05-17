import {Socket, Server} from 'socket.io';
import { DatabaseService } from '../../db/services/databaseService';
import { eq, and } from '../../db/queryBuilders/filters';

const SCHEMA = 'workout_app';

export interface Notification {
  notification_id: string;
  user_uuid: string;
  title: string;
  message: string;
  type: string;
  related_entity_id?: string;
  is_read: boolean;
  created_at: string;
}

export class NotificationService {
  private userSockets: Map<string, Socket[]> = new Map(); // Изменено на массив сокетов для поддержки множественных сессий
  private io: Server;
  private diagnosticInterval: NodeJS.Timeout | null = null;

  constructor(io: Server) {
    this.io = io;
    
    // Логируем параметры Socket.IO сервера
    console.log('[NotificationService] Инициализация с параметрами:');
    console.log('- Path:', io.path());
    console.log('- Adapter:', io.adapter.constructor.name);
    
    // Безопасный доступ к настройкам CORS
    const corsEnabled = io._opts && io._opts.cors ? 'Включен' : 'Отключен';
    console.log('- CORS:', corsEnabled);
    
    // Безопасное получение origins
    const corsOrigins = io._opts && io._opts.cors && typeof io._opts.cors !== 'function' 
      ? io._opts.cors.origin 
      : 'Не задано';
    console.log('- CORS origins:', corsOrigins);
    
    this.setupSocketHandlers();
    console.log('[NotificationService] Сервис уведомлений инициализирован');
    
    // Настройка глобальных обработчиков Socket.IO сервера
    this.io.engine.on('connection_error', (err) => {
      console.error('[NotificationService:Engine] Ошибка подключения:', err);
    });
    
    // Включаем детальное логирование
    this.enableDiagnostics();
  }
  
  private enableDiagnostics() {
    // Периодическая диагностика
    this.diagnosticInterval = setInterval(() => {
      const connectedSockets = Object.keys(this.io.sockets.sockets).length;
      const totalRegisteredSockets = [...this.userSockets.values()].reduce(
        (sum, socketsArray) => sum + socketsArray.length, 0
      );
      
      console.log(`[NotificationService:Stats] Сокеты: ${connectedSockets} подключено, ${totalRegisteredSockets} зарегистрировано`);
      console.log(`[NotificationService:Stats] Пользователи: ${this.userSockets.size} с активными соединениями`);
      
      // Отчет по комнатам
      const rooms = this.io.sockets.adapter.rooms;
      const userRooms = Array.from(rooms.keys()).filter(room => room.startsWith('user:'));
      console.log(`[NotificationService:Stats] Активные комнаты пользователей: ${userRooms.length}`);
      
      // Проверяем состояние сокетов для каждого пользователя
      this.userSockets.forEach((sockets, userId) => {
        const connectedCount = sockets.filter(socket => socket.connected).length;
        if (connectedCount === 0 && sockets.length > 0) {
          console.log(`[NotificationService:Warning] Пользователь ${userId} имеет ${sockets.length} сокетов, но 0 подключенных`);
          
          // Очищаем отключенные сокеты
          const filteredSockets = sockets.filter(socket => socket.connected);
          if (filteredSockets.length === 0) {
            this.userSockets.delete(userId);
            console.log(`[NotificationService:Cleanup] Удалены все сокеты для пользователя ${userId}`);
          } else {
            this.userSockets.set(userId, filteredSockets);
            console.log(`[NotificationService:Cleanup] Удалено ${sockets.length - filteredSockets.length} отключенных сокетов для пользователя ${userId}`);
          }
        }
      });
      
      // Отправляем тестовое сообщение в каждую комнату для проверки
      if (userRooms.length > 0) {
        userRooms.forEach(room => {
          const userId = room.replace('user:', '');
          this.io.to(room).emit('ping_test', { 
            timestamp: new Date().toISOString(),
            message: 'Проверка активности комнаты'
          });
          console.log(`[NotificationService:Test] Отправлен ping в комнату ${room}`);
        });
      }
    }, 30000); // каждые 30 секунд
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('[NotificationService] Клиент подключен к сокету:', socket.id);
      console.log('[NotificationService] Данные запроса:', socket.handshake.query);
      console.log('[NotificationService] Адрес клиента:', socket.handshake.address);
      console.log('[NotificationService] Headers:', JSON.stringify(socket.handshake.headers));
      
      // Немедленно отправляем тестовое событие для проверки соединения
      try {
        socket.emit('test_connection', { 
          success: true, 
          message: 'Соединение с сервером установлено', 
          timestamp: new Date().toISOString(),
          socketId: socket.id
        });
        console.log(`[NotificationService] Отправлено тестовое сообщение test_connection для сокета ${socket.id}`);
      } catch (error) {
        console.error(`[NotificationService] Ошибка при отправке test_connection:`, error);
      }
      
      // Обработка регистрации пользователя
      socket.on('register', async (data: { userUuid: string }) => {
        console.log('[NotificationService] Получены данные регистрации:', data);
        
        if (!data || !data.userUuid) {
          console.error('[NotificationService] Получены недействительные данные регистрации:', data);
          socket.emit('error', { message: 'Недействительные данные регистрации' });
          return;
        }
        
        try {
          console.log(`[NotificationService] Сокет ${socket.id} регистрируется для пользователя ${data.userUuid}`);
          this.registerUser(data.userUuid, socket);
          
          // Отправляем тестовое уведомление для проверки соединения
          socket.emit('test_response', { 
            success: true, 
            message: 'Регистрация выполнена успешно', 
            timestamp: new Date().toISOString() 
          });
          
          // Отправляем непрочитанные уведомления при подключении
          try {
            const unreadNotifications = await this.getUnreadNotifications(data.userUuid);
            console.log(`[NotificationService] Найдено ${unreadNotifications.length} непрочитанных уведомлений для пользователя ${data.userUuid}`);
            if (unreadNotifications.length > 0) {
              socket.emit('unread_notifications', unreadNotifications);
              console.log(`[NotificationService] Уведомления отправлены через сокет ${socket.id}`);
            }
          } catch (error) {
            console.error('[NotificationService] Ошибка при получении непрочитанных уведомлений:', error);
            socket.emit('error', { message: 'Ошибка при получении уведомлений' });
          }
          
          // Создаем тестовое уведомление для проверки
          try {
            const testNotificationId = await this.addNotification(
              data.userUuid,
              'Тестовое уведомление',
              'Проверка работы системы уведомлений',
              'info'
            );
            
            // Оповещаем пользователя о тестовом уведомлении
            const testNotification = {
              notification_id: testNotificationId,
              user_uuid: data.userUuid,
              title: 'Тестовое уведомление',
              message: 'Проверка работы системы уведомлений. Время: ' + new Date().toISOString(),
              type: 'info',
              is_read: false,
              created_at: new Date().toISOString()
            };
            
            // Двойная отправка для надежности
            // Отправляем через сокет напрямую
            socket.emit('notification', testNotification);
            console.log(`[NotificationService] Тестовое уведомление отправлено напрямую через сокет ${socket.id}`);
            
            // Также отправляем через комнату
            this.io.to(`user:${data.userUuid}`).emit('notification', testNotification);
            console.log(`[NotificationService] Тестовое уведомление отправлено через комнату user:${data.userUuid}`);
          } catch (error) {
            console.error('[NotificationService] Ошибка при создании тестового уведомления:', error);
          }
        } catch (error) {
          console.error('[NotificationService] Ошибка при регистрации пользователя:', error);
          socket.emit('error', { message: 'Внутренняя ошибка сервера при регистрации пользователя' });
        }
      });
      
      // Обработчик тестовых сообщений для проверки сокетов
      socket.on('test_message', async (data: { userUuid: string, message: string }) => {
        console.log('[NotificationService] Получено тестовое сообщение:', data);
        
        if (!data || !data.userUuid) {
          console.error('[NotificationService] Недействительные данные тестового сообщения');
          socket.emit('error', { message: 'Недействительные данные тестового сообщения' });
          return;
        }
        
        try {
          // Отправляем ответ на тестовое сообщение
          socket.emit('test_response', { 
            success: true, 
            message: 'Тестовое сообщение получено сервером', 
            timestamp: new Date().toISOString() 
          });
          
          // Создаем реальное уведомление для пользователя
          await this.notifyUser(
            data.userUuid,
            data.message || 'Тестовое сообщение',
            'Тестовое уведомление',
            'info'
          );
          
          console.log(`[NotificationService] Тестовое уведомление создано для пользователя ${data.userUuid}`);
        } catch (error) {
          console.error('[NotificationService] Ошибка обработки тестового сообщения:', error);
          socket.emit('error', { message: 'Ошибка обработки тестового сообщения' });
        }
      });
      
      socket.on('mark_read', async (data: { notificationId: string, userUuid: string }) => {
        if (!data || !data.notificationId || !data.userUuid) {
          console.error('[NotificationService] Получены недействительные данные для отметки прочтения:', data);
          return;
        }
        
        console.log(`[NotificationService] Отметка прочтения уведомления ${data.notificationId} для пользователя ${data.userUuid}`);
        await this.markNotificationRead(data.notificationId, data.userUuid);
      });
      
      socket.on('mark_all_read', async (data: { userUuid: string }) => {
        if (!data || !data.userUuid) {
          console.error('[NotificationService] Получены недействительные данные для отметки всех прочитанными:', data);
          return;
        }
        
        console.log(`[NotificationService] Отметка всех уведомлений прочитанными для пользователя ${data.userUuid}`);
        await this.markAllNotificationsRead(data.userUuid);
        
        // Уведомляем клиента об успешном выполнении операции
        socket.emit('all_marked_read', { success: true });
      });
      
      socket.on('disconnect', (reason) => {
        console.log(`[NotificationService] Клиент отключен: ${socket.id}, причина: ${reason}`);
        this.unregisterUser(socket);
      });
      
      // Обработка всех ошибок сокета
      socket.on('error', (error) => {
        console.error(`[NotificationService] Ошибка сокета ${socket.id}:`, error);
      });
      
      // Пинг для проверки соединения
      socket.on('ping', () => {
        try {
          socket.emit('pong', { 
            time: Date.now(),
            timestamp: new Date().toISOString(),
            socketId: socket.id
          });
          console.log(`[NotificationService] Отправлен pong на запрос ping от сокета ${socket.id}`);
        } catch (error) {
          console.error(`[NotificationService] Ошибка при отправке pong:`, error);
        }
      });
      
      // Ответ клиента на диагностический ping
      socket.on('pong_response', (data) => {
        console.log(`[NotificationService] Получен pong_response от сокета ${socket.id}:`, data);
        // Вычисляем задержку
        if (data.receivedPingAt) {
          const pingTime = new Date(data.receivedPingAt).getTime();
          const now = Date.now();
          const latency = now - pingTime;
          console.log(`[NotificationService] Задержка соединения с сокетом ${socket.id}: ${latency}ms`);
        }
      });

      // Добавляем обработчик для форсированной отправки уведомлений
      socket.on('force_notification', async (data: { userUuid: string, notificationType?: string }) => {
        console.log(`[NotificationService] Запрос на принудительную отправку уведомления:`, data);
        
        if (!data || !data.userUuid) {
          console.error('[NotificationService] Некорректные данные для force_notification');
          return;
        }
        
        try {
          // Создаем и отправляем тестовое уведомление
          const type = data.notificationType || 'info';
          const testMessage = `Тестовое уведомление по запросу. Время: ${new Date().toISOString()}`;
          
          await this.notifyUser(
            data.userUuid,
            testMessage,
            'Тестовое уведомление',
            type
          );
          
          socket.emit('test_response', { 
            success: true, 
            message: 'Тестовое уведомление отправлено принудительно',
            timestamp: new Date().toISOString()
          });
          
          console.log(`[NotificationService] Отправлено принудительное уведомление пользователю ${data.userUuid}`);
        } catch (error) {
          console.error('[NotificationService] Ошибка при отправке принудительного уведомления:', error);
          socket.emit('error', { message: 'Ошибка при отправке принудительного уведомления' });
        }
      });
    });
  }

  public registerUser(userUuid: string, socket: Socket) {
    console.log(`[NotificationService] Регистрация сокета для пользователя ${userUuid}`);
    
    // Получаем существующие сокеты пользователя или создаем новый массив
    const userSockets = this.userSockets.get(userUuid) || [];
    
    // Проверяем, не зарегистрирован ли уже этот сокет
    if (!userSockets.some(s => s.id === socket.id)) {
      userSockets.push(socket);
      this.userSockets.set(userUuid, userSockets);
      console.log(`[NotificationService] Пользователь ${userUuid} теперь имеет ${userSockets.length} активных соединений`);
    }
    
    // Присоединяем пользователя к персональному каналу
    const roomName = `user:${userUuid}`;
    socket.join(roomName);
    console.log(`[NotificationService] Сокет ${socket.id} присоединен к комнате ${roomName}`);
    
    // Отправляем приветственное сообщение
    socket.emit('welcome', { 
      message: 'Подключение к серверу уведомлений установлено',
      userId: userUuid,
      socketId: socket.id
    });
  }

  public unregisterUser(socket: Socket) {
    let removed = false;
    
    // Ищем пользователя, которому принадлежит этот сокет
    for (const [uuid, sockets] of this.userSockets.entries()) {
      const index = sockets.findIndex(s => s.id === socket.id);
      
      if (index !== -1) {
        // Удаляем сокет из массива
        sockets.splice(index, 1);
        console.log(`[NotificationService] Сокет ${socket.id} удален для пользователя ${uuid}`);
        
        // Если у пользователя больше нет сокетов, удаляем запись
        if (sockets.length === 0) {
          this.userSockets.delete(uuid);
          console.log(`[NotificationService] Пользователь ${uuid} больше не имеет активных соединений`);
        } else {
          // Обновляем массив сокетов
          this.userSockets.set(uuid, sockets);
          console.log(`[NotificationService] У пользователя ${uuid} осталось ${sockets.length} активных соединений`);
        }
        
        removed = true;
        break;
      }
    }
    
    if (!removed) {
      console.log(`[NotificationService] Сокет ${socket.id} не был найден в зарегистрированных соединениях`);
    }
  }

  public async notifyUser(userUuid: string, message: string, title: string = 'Уведомление', type: string = 'info', relatedEntityId?: string) {
    console.log(`[NotificationService] Отправка уведомления пользователю ${userUuid}: ${title} - ${message}`);
    
    try {
      // Сохраняем уведомление в БД
      const notificationId = await this.addNotification(userUuid, title, message, type, relatedEntityId);
      
      // Создаем объект уведомления для отправки
      const notification = {
        notification_id: notificationId,
        user_uuid: userUuid,
        title,
        message,
        type,
        related_entity_id: relatedEntityId,
        is_read: false,
        created_at: new Date().toISOString()
      };
      
      // Проверяем, есть ли активные сокеты для данного пользователя
      const userSockets = this.userSockets.get(userUuid) || [];
      console.log(`[NotificationService] Найдено ${userSockets.length} сокетов для пользователя ${userUuid}`);
      
      if (userSockets.length > 0) {
        // Отправляем уведомление на все сокеты пользователя
        let successCount = 0;
        for (const socket of userSockets) {
          try {
            if (socket.connected) {
              socket.emit('notification', notification);
              successCount++;
              console.log(`[NotificationService] Уведомление отправлено через сокет ${socket.id}`);
            } else {
              console.log(`[NotificationService] Сокет ${socket.id} отключен, уведомление не отправлено`);
            }
          } catch (error) {
            console.error(`[NotificationService] Ошибка при отправке уведомления через сокет ${socket.id}:`, error);
          }
        }
        console.log(`[NotificationService] Уведомление успешно отправлено на ${successCount} из ${userSockets.length} сокетов`);
      }
      
      // Также отправляем через комнату
      this.io.to(`user:${userUuid}`).emit('notification', notification);
      console.log(`[NotificationService] Уведомление отправлено в комнату user:${userUuid}`);
      
      return notificationId;
    } catch (error) {
      console.error('[NotificationService] Ошибка при отправке уведомления:', error);
      throw error;
    }
  }

  public notifyAll(message: string, title: string = 'Уведомление', type: string = 'info') {
    console.log(`[NotificationService] Отправка уведомления всем: ${title} - ${message}`);
    this.io.emit('notification', { 
      title, 
      message, 
      type, 
      created_at: new Date().toISOString() 
    });
  }

  private async addNotification(userUuid: string, title: string, message: string, type: string, relatedEntityId?: string): Promise<string> {
    try {
      const databaseClient = DatabaseService.getClient('main');
      const databaseProvider = databaseClient.getProvider();
      const knex = databaseClient.getKnex();

      const [notification] = await databaseProvider.insert(knex, {
        table: 'notifications',
        schema: SCHEMA,
        values: [{
          user_uuid: userUuid,
          title,
          message,
          type,
          related_entity_id: relatedEntityId,
          is_read: false,
          created_at: new Date().toISOString()
        }],
        returning: ['notification_id']
      });
      
      console.log(`[NotificationService] Уведомление добавлено в БД с ID: ${notification.notification_id}`);
      return notification.notification_id;
    } catch (error) {
      console.error('[NotificationService] Ошибка добавления уведомления в базу данных:', error);
      throw error;
    }
  }

  private async getUnreadNotifications(userUuid: string): Promise<Notification[]> {
    try {
      const databaseClient = DatabaseService.getClient('main');
      const databaseProvider = databaseClient.getProvider();
      const knex = databaseClient.getKnex();

      const notifications = await databaseProvider.select(knex, {
        table: 'notifications',
        schema: SCHEMA,
        columns: ['*'],
        where: and([
          eq('user_uuid', userUuid),
          eq('is_read', false)
        ]),
        orderBy: [{ column: 'created_at', direction: 'desc' }]
      });
      
      console.log(`[NotificationService] Получено ${notifications.length} непрочитанных уведомлений для пользователя ${userUuid}`);
      return notifications;
    } catch (error) {
      console.error('[NotificationService] Ошибка получения непрочитанных уведомлений:', error);
      return [];
    }
  }

  private async markNotificationRead(notificationId: string, userUuid: string): Promise<void> {
    try {
      const databaseClient = DatabaseService.getClient('main');
      const databaseProvider = databaseClient.getProvider();
      const knex = databaseClient.getKnex();

      await databaseProvider.update(knex, {
        table: 'notifications',
        schema: SCHEMA,
        values: { is_read: true },
        where: and([
          eq('notification_id', notificationId),
          eq('user_uuid', userUuid)
        ])
      });
      
      console.log(`[NotificationService] Уведомление ${notificationId} отмечено как прочитанное для пользователя ${userUuid}`);
      
      // Уведомляем все соединения пользователя об обновлении статуса
      this.io.to(`user:${userUuid}`).emit('notification_read', { notification_id: notificationId });
    } catch (error) {
      console.error('[NotificationService] Ошибка отметки уведомления как прочитанного:', error);
    }
  }

  private async markAllNotificationsRead(userUuid: string): Promise<void> {
    try {
      const databaseClient = DatabaseService.getClient('main');
      const databaseProvider = databaseClient.getProvider();
      const knex = databaseClient.getKnex();

      await databaseProvider.update(knex, {
        table: 'notifications',
        schema: SCHEMA,
        values: { is_read: true },
        where: and([
          eq('user_uuid', userUuid),
          eq('is_read', false)
        ])
      });
      
      console.log(`[NotificationService] Все уведомления отмечены как прочитанные для пользователя ${userUuid}`);
      
      // Уведомляем все соединения пользователя об обновлении статуса всех уведомлений
      this.io.to(`user:${userUuid}`).emit('all_notifications_read');
    } catch (error) {
      console.error('[NotificationService] Ошибка отметки всех уведомлений как прочитанных:', error);
    }
  }
}

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from '../db/queryBuilders/filters';
import { DatabaseService } from '../db/services/databaseService';
import { AuthenticatedFastifyInstance } from '../../types/fastify';
import { AuthStore } from '../services/AuthStore';
import crypto from 'crypto';

const SCHEMA = 'workout_app';

/**
 * Инициализация глобальных переменных для обеспечения доступа к Socket.IO и NotificationService
 * Эти переменные помогают сохранять ссылки, даже если fastify-декораторы не работают
 */
if (!(global as any).socketInitialized) {
  console.log('[Global] Инициализация глобальных переменных для сокетов');
  (global as any).socketIO = null;
  (global as any).notificationServiceInstance = null;
  (global as any).socketInitialized = true;
}

/**
 * notificationPlugin - объединенный плагин для работы с приглашениями и уведомлениями
 * Содержит функциональность из participantPlugin и invitationPlugin
 */
const notificationPlugin: FastifyPluginAsync = async (fastify: AuthenticatedFastifyInstance) => {
  const authStore = AuthStore.getInstance();
  let io: any = null;
  let notificationService: any = null;
  
  // Пытаемся получить ссылки на глобальные переменные, если они уже есть
  if ((global as any).socketIO) {
    console.log('[notificationPlugin] socketIO найден в глобальных переменных');
    io = (global as any).socketIO;
  }
  
  if ((global as any).notificationServiceInstance) {
    console.log('[notificationPlugin] notificationService найден в глобальных переменных');
    notificationService = (global as any).notificationServiceInstance;
  }
  
  // Проверяем наличие декораторов с попыткой получить их асинхронно
  if (!fastify.hasDecorator('notificationService') || !fastify.hasDecorator('io')) {
    console.log('[notificationPlugin] Декораторы не найдены при старте, ждем инициализацию...');
    
    // Попытаемся подождать инициализацию декораторов
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (fastify.hasDecorator('notificationService')) {
      console.log('[notificationPlugin] Декоратор notificationService успешно найден после ожидания');
      notificationService = fastify.notificationService;
      // Сохраняем в глобальную переменную
      (global as any).notificationServiceInstance = notificationService;
      console.log('[notificationPlugin] notificationService сохранен в глобальной переменной');
    } else {
      console.error('[notificationPlugin] ОШИБКА: notificationService не декорирован в fastify после ожидания');
    }
    
    if (fastify.hasDecorator('io')) {
      console.log('[notificationPlugin] Декоратор io успешно найден после ожидания');
      io = fastify.io;
      // Сохраняем в глобальную переменную
      (global as any).socketIO = io;
      console.log('[notificationPlugin] io сохранен в глобальной переменной');
    } else {
      console.error('[notificationPlugin] ОШИБКА: io не декорирован в fastify после ожидания');
    }
  } else {
    console.log('[notificationPlugin] Декораторы обнаружены при первой проверке');
    notificationService = fastify.notificationService;
    io = fastify.io;
    // Сохраняем в глобальные переменные
    (global as any).notificationServiceInstance = notificationService;
    (global as any).socketIO = io;
    console.log('[notificationPlugin] Декораторы сохранены в глобальных переменных');
  }

  // Получение ссылок на декораторы для дальнейшего использования
  const getNotificationService = () => {
    if (notificationService) return notificationService;
    
    if (fastify.hasDecorator('notificationService')) {
      notificationService = fastify.notificationService;
      return notificationService;
    }
    
    // Проверяем глобальные переменные, если декоратор недоступен
    if ((global as any).notificationServiceInstance) {
      console.log('[notificationPlugin] Использую notificationService из глобальной переменной');
      notificationService = (global as any).notificationServiceInstance;
      return notificationService;
    }
    
    console.error('[notificationPlugin] notificationService не найден ни в декораторах, ни в глобальных переменных');
    return null;
  };
  
  const getIO = () => {
    if (io) return io;
    
    if (fastify.hasDecorator('io')) {
      io = fastify.io;
      return io;
    }
    
    // Проверяем глобальные переменные, если декоратор недоступен
    if ((global as any).socketIO) {
      console.log('[notificationPlugin] Использую Socket.IO из глобальной переменной');
      io = (global as any).socketIO;
      return io;
    }
    
    console.error('[notificationPlugin] Socket.IO не найден ни в декораторах, ни в глобальных переменных');
    return null;
  };

  // Вспомогательная функция для получения пользователя из запроса
  const getUserFromRequest = (request: FastifyRequest) => {
    const signature = request.cookies.auth_token || 
                     request.headers.authorization?.replace('Bearer ', '');
    if (!signature) return null;
    return authStore.getUser(signature);
  };

  // Функция для отправки уведомлений о приглашениях
  const sendInvitationNotification = async (
    recipientUuid: string,
    senderName: string,
    workoutTitle: string,
    invitationId: string | undefined,
    workoutId: string
  ) => {
    console.log(`[notificationPlugin] Отправка уведомления о приглашении пользователю ${recipientUuid}`);
    
    // Получаем сервисы
    const notificationService = getNotificationService();
    const io = getIO();
    
    if (!notificationService) {
      console.error('[notificationPlugin] notificationService не доступен');
      return;
    }
    
    if (!io) {
      console.error('[notificationPlugin] io не доступен');
      return;
    }
    
    if (!recipientUuid) {
      console.error('[notificationPlugin] Ошибка: ID получателя не определен');
      return;
    }
    
    try {
      // Всегда используем временный ID для большей надежности
      const tempInvitationId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      console.log(`[notificationPlugin] Используем ID приглашения: ${tempInvitationId}`);
      
      // Отправляем уведомление с типом invitation для специальной обработки
      const message = `${senderName} приглашает вас принять участие в тренировке "${workoutTitle}"`;
      const notificationId = await notificationService.notifyUser(
        recipientUuid,
        message,
        'Новое приглашение',
        'invitation',
        workoutId
      );
      
      console.log(`[notificationPlugin] Уведомление отправлено, id=${notificationId}`);
      
      // Повторная попытка отправки через 1 секунду для надежности
      setTimeout(() => {
        try {
          // Снова проверяем доступность io
          const currentIO = getIO();
          if (!currentIO) {
            console.error('[notificationPlugin] io не доступен при повторной отправке');
            return;
          }
          
          console.log(`[notificationPlugin] Повторная отправка уведомления ${notificationId} пользователю ${recipientUuid}`);
          // Отправляем напрямую в комнату пользователя
          currentIO.to(`user:${recipientUuid}`).emit('notification', {
            notification_id: notificationId,
            user_uuid: recipientUuid,
            title: 'Новое приглашение',
            message: message,
            type: 'invitation',
            related_entity_id: workoutId,
            invitation_id: tempInvitationId,
            is_read: false,
            created_at: new Date().toISOString()
          });
        } catch (error) {
          console.error('[notificationPlugin] Ошибка при повторной отправке уведомления:', error);
        }
      }, 1000);
      
      return notificationId;
    } catch (error) {
      console.error('[notificationPlugin] Ошибка при отправке уведомления:', error);
      return null;
    }
  };

  // === МАРШРУТЫ ДЛЯ РАБОТЫ С ПРИГЛАШЕНИЯМИ ===

  // Получение всех приглашений для текущего пользователя
  fastify.get('/invitations', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    try {
      // Получаем приглашения где пользователь - получатель
      const invitations = await databaseProvider.select(knex, {
        table: 'invitations',
        schema: SCHEMA,
        columns: ['invitations.*', 'workouts.title as workout_title'],
        joins: [{
          type: 'inner',
          table: 'workouts',
          on: ['invitations.workout_uuid', '=', 'workouts.workout_uuid']
        }],
        where: and([
          eq('recipient_uuid', user.uuid),
          eq('status', 'pending')
        ]),
        orderBy: [{ column: 'created_at', direction: 'desc' }]
      });

      return { invitations };
    } catch (error) {
      console.error('Ошибка при получении приглашений:', error);
      return reply.status(500).send({ error: 'Ошибка при получении приглашений' });
    }
  });

  // Отправить приглашение
  fastify.post('/invitations', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    
    console.log('[POST /invitations] Получен запрос на приглашение:', req.body);
    
    const { workout_uuid, recipient_uuid, email } = req.body as any;
    if (!workout_uuid) {
      return reply.status(400).send({ error: 'Не указан ID тренировки (workout_uuid)' });
    }
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Проверка: только создатель может приглашать
    console.log(`[POST /invitations] Проверяем, является ли пользователь ${user.uuid} создателем тренировки ${workout_uuid}`);
    const [workoutInfo] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by', 'title'],
      where: eq('workout_uuid', workout_uuid)
    });
    
    if (!workoutInfo) {
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }
    
    const isCreator = workoutInfo.created_by === user.uuid;
    console.log(`[POST /invitations] Пользователь ${user.uuid} создатель тренировки: ${isCreator}`);
    
    if (!isCreator) {
      return reply.status(403).send({ error: 'Только создатель тренировки может отправлять приглашения' });
    }

    // Поиск получателя по email, если он указан
    let targetRecipientUuid = recipient_uuid;
    if (!targetRecipientUuid && email) {
      console.log(`[POST /invitations] Ищем пользователя по email: ${email}`);
      const [foundUser] = await databaseProvider.select(knex, {
        table: 'users',
        schema: SCHEMA,
        columns: ['user_uuid'],
        where: eq('email', email)
      });
      
      if (foundUser) {
        targetRecipientUuid = foundUser.user_uuid;
        console.log(`[POST /invitations] Найден пользователь с email ${email}: ${targetRecipientUuid}`);
      } else {
        console.log(`[POST /invitations] Пользователь с email ${email} не найден`);
        return reply.status(404).send({ error: 'Пользователь с указанным email не найден' });
      }
    }
    
    if (!targetRecipientUuid) {
      return reply.status(400).send({ error: 'Не указан получатель приглашения' });
    }

    // Проверка: не приглашать самого себя и не приглашать уже участвующего
    if (targetRecipientUuid === user.uuid) {
      return reply.status(400).send({ error: 'Нельзя пригласить себя' });
    }
    
    console.log(`[POST /invitations] Проверяем, является ли пользователь ${targetRecipientUuid} уже участником тренировки`);
    const [alreadyParticipant] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['user_uuid'],
      where: and([
        eq('workout_uuid', workout_uuid),
        eq('user_uuid', targetRecipientUuid)
      ])
    });
    
    if (alreadyParticipant) {
      return reply.status(400).send({ error: 'Пользователь уже участник' });
    }
    
    // Проверяем, существует ли уже активное приглашение
    console.log(`[POST /invitations] Проверяем существующие приглашения`);
    const [existingInvitation] = await databaseProvider.select(knex, {
      table: 'invitations',
      schema: SCHEMA,
      columns: ['invitation_uuid'],
      where: and([
        eq('workout_uuid', workout_uuid),
        eq('recipient_uuid', targetRecipientUuid),
        eq('status', 'pending')
      ])
    });
    
    if (existingInvitation) {
      return reply.status(400).send({ error: 'Приглашение уже отправлено' });
    }

    // Получаем данные о текущем пользователе для уведомления
    const [userInfo] = await databaseProvider.select(knex, {
      table: 'users',
      schema: SCHEMA,
      columns: ['display_name', 'username'],
      where: eq('user_uuid', user.uuid)
    });

    const senderName = userInfo.display_name || userInfo.username;

    // Создать приглашение
    console.log(`[POST /invitations] Создаем новое приглашение`);
    try {
      // Создаем UUID для приглашения на сервере
      const invitationUuid = crypto.randomUUID();
      
      // Используем созданный UUID при вставке
      await databaseProvider.insert(knex, {
        table: 'invitations',
        schema: SCHEMA,
        values: [{
          invitation_uuid: invitationUuid,
          workout_uuid,
          sender_uuid: user.uuid,
          recipient_uuid: targetRecipientUuid,
          status: 'pending',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }]
      });
      
      // Создаем объект приглашения с известным UUID
      const invitation = {
        invitation_uuid: invitationUuid,
        workout_uuid,
        sender_uuid: user.uuid,
        recipient_uuid: targetRecipientUuid,
        status: 'pending'
      };
      
      // Отправляем уведомление получателю
      const currentNotificationService = getNotificationService();
      if (currentNotificationService) {
        console.log(`[POST /invitations] Отправляем уведомление получателю ${targetRecipientUuid}`);
        
        // Используем наш заранее сгенерированный UUID
        console.log(`[POST /invitations] Данные приглашения:`, {
          invitationExists: true,
          invitationId: invitationUuid,
          workoutId: workout_uuid
        });
        
        await sendInvitationNotification(
          targetRecipientUuid,
          senderName,
          workoutInfo.title,
          invitationUuid,
          workout_uuid
        );
      } else {
        console.error('[POST /invitations] notificationService недоступен, уведомление не отправлено');
      }
      
      console.log(`[POST /invitations] Приглашение успешно создано с ID: ${invitationUuid}`);
      return { invitation };
    } catch (error) {
      console.error('[POST /invitations] Ошибка при создании приглашения:', error);
      return reply.status(500).send({ error: 'Ошибка при создании приглашения' });
    }
  });

  // Принять приглашение
  fastify.post('/invitations/:id/accept', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;

    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    try {
      // Обновляем статус приглашения на "принятое"
      await databaseProvider.update(knex, {
        table: 'invitations',
        schema: SCHEMA,
        values: { status: 'accepted' },
        where: and([
          eq('invitation_uuid', id),
          eq('recipient_uuid', user.uuid),
          eq('status', 'pending')
        ])
      });

      // Получаем информацию о приглашении
      const [invitation] = await databaseProvider.select(knex, {
        table: 'invitations',
        schema: SCHEMA,
        columns: ['workout_uuid'],
        where: eq('invitation_uuid', id)
      });

      if (!invitation) {
        return reply.status(404).send({ error: 'Приглашение не найдено' });
      }

      // Добавляем пользователя как участника тренировки
      await databaseProvider.insert(knex, {
        table: 'workout_participants',
        schema: SCHEMA,
        values: [{
          workout_uuid: invitation.workout_uuid,
          user_uuid: user.uuid,
          role: 'participant'
        }]
      });

      // Уведомляем создателя приглашения, если есть сервис уведомлений
      const [senderInfo] = await databaseProvider.select(knex, {
        table: 'invitations',
        schema: SCHEMA,
        columns: ['sender_uuid'],
        where: eq('invitation_uuid', id)
      });

      const currentNotificationService = getNotificationService();
      if (senderInfo && currentNotificationService) {
        const [userInfo] = await databaseProvider.select(knex, {
          table: 'users',
          schema: SCHEMA,
          columns: ['display_name', 'username'],
          where: eq('user_uuid', user.uuid)
        });

        const [workoutInfo] = await databaseProvider.select(knex, {
          table: 'workouts',
          schema: SCHEMA,
          columns: ['title'],
          where: eq('workout_uuid', invitation.workout_uuid)
        });

        const userName = userInfo.display_name || userInfo.username;
        currentNotificationService.notifyUser(
          senderInfo.sender_uuid,
          `${userName} принял приглашение на тренировку "${workoutInfo.title}"`,
          'Приглашение принято',
          'success',
          invitation.workout_uuid
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Ошибка при принятии приглашения:', error);
      return reply.status(500).send({ error: 'Ошибка при принятии приглашения' });
    }
  });

  // Отклонить приглашение
  fastify.post('/invitations/:id/decline', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;

    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    try {
      // Обновляем статус приглашения на "отклоненное"
      await databaseProvider.update(knex, {
        table: 'invitations',
        schema: SCHEMA,
        values: { status: 'declined' },
        where: and([
          eq('invitation_uuid', id),
          eq('recipient_uuid', user.uuid),
          eq('status', 'pending')
        ])
      });

      // Уведомляем отправителя, если доступен сервис уведомлений
      const [invitation] = await databaseProvider.select(knex, {
        table: 'invitations',
        schema: SCHEMA,
        columns: ['sender_uuid', 'workout_uuid'],
        where: eq('invitation_uuid', id)
      });

      const currentNotificationService = getNotificationService();
      if (invitation && currentNotificationService) {
        const [userInfo] = await databaseProvider.select(knex, {
          table: 'users',
          schema: SCHEMA,
          columns: ['display_name', 'username'],
          where: eq('user_uuid', user.uuid)
        });

        const [workoutInfo] = await databaseProvider.select(knex, {
          table: 'workouts',
          schema: SCHEMA,
          columns: ['title'],
          where: eq('workout_uuid', invitation.workout_uuid)
        });

        const userName = userInfo.display_name || userInfo.username;
        currentNotificationService.notifyUser(
          invitation.sender_uuid,
          `${userName} отклонил приглашение на тренировку "${workoutInfo.title}"`,
          'Приглашение отклонено',
          'warning',
          invitation.workout_uuid
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Ошибка при отклонении приглашения:', error);
      return reply.status(500).send({ error: 'Ошибка при отклонении приглашения' });
    }
  });
};

export default notificationPlugin; 
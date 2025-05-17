import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from '../db/queryBuilders/filters';
import { DatabaseService } from '../db/services/databaseService';
import { AuthenticatedFastifyInstance } from '../../types/fastify';
import { AuthStore } from '../services/AuthStore';

const SCHEMA = 'workout_app';

const invitationPlugin: FastifyPluginAsync = async (fastify: AuthenticatedFastifyInstance) => {
  const authStore = AuthStore.getInstance();

  const getUserFromRequest = (request: FastifyRequest) => {
    const signature = request.cookies.auth_token || 
                     request.headers.authorization?.replace('Bearer ', '');
    if (!signature) return null;
    return authStore.getUser(signature);
  };

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
        ])
      });

      return { invitations };
    } catch (error) {
      console.error('Ошибка при получении приглашений:', error);
      return reply.status(500).send({ error: 'Ошибка при получении приглашений' });
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

      if (senderInfo && fastify.notificationService) {
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
        fastify.notificationService.notifyUser(
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

      return { success: true };
    } catch (error) {
      console.error('Ошибка при отклонении приглашения:', error);
      return reply.status(500).send({ error: 'Ошибка при отклонении приглашения' });
    }
  });

  // Улучшенная функция отправки уведомлений о приглашениях
  const sendInvitationNotification = async (
    fastify: AuthenticatedFastifyInstance,
    recipientUuid: string,
    senderName: string,
    workoutTitle: string,
    invitationId: string | undefined,
    workoutId: string
  ) => {
    console.log(`[invitationPlugin] Отправка уведомления о приглашении пользователю ${recipientUuid}`);
    
    // Проверяем наличие декораторов
    if (!fastify.hasDecorator('notificationService')) {
      console.error('[invitationPlugin] ОШИБКА: notificationService не декорирован в fastify');
      return;
    }
    
    if (!fastify.notificationService) {
      console.error('[invitationPlugin] notificationService не доступен');
      return;
    }
    
    if (!fastify.hasDecorator('io')) {
      console.error('[invitationPlugin] ОШИБКА: io не декорирован в fastify');
      return;
    }
    
    if (!fastify.io) {
      console.error('[invitationPlugin] io не доступен');
      return;
    }
    
    if (!recipientUuid) {
      console.error('[invitationPlugin] Ошибка: ID получателя не определен');
      return;
    }
    
    try {
      // Если ID приглашения не определен, используем временный ID
      const safeInvitationId = invitationId || `temp-${Date.now()}`;
      console.log(`[invitationPlugin] Используем ID приглашения: ${safeInvitationId}`);
      
      // Отправляем уведомление с типом invitation для специальной обработки
      const message = `${senderName} приглашает вас принять участие в тренировке "${workoutTitle}"`;
      const notificationId = await fastify.notificationService.notifyUser(
        recipientUuid,
        message,
        'Новое приглашение',
        'invitation',
        workoutId
      );
      
      console.log(`[invitationPlugin] Уведомление отправлено, id=${notificationId}`);
      
      // Повторная попытка отправки через 1 секунду для надежности
      setTimeout(() => {
        try {
          if (!fastify.io) {
            console.error('[invitationPlugin] io не доступен при повторной отправке');
            return;
          }
          
          console.log(`[invitationPlugin] Повторная отправка уведомления ${notificationId} пользователю ${recipientUuid}`);
          // Отправляем напрямую в комнату пользователя
          fastify.io.to(`user:${recipientUuid}`).emit('notification', {
            notification_id: notificationId,
            user_uuid: recipientUuid,
            title: 'Новое приглашение',
            message: message,
            type: 'invitation',
            related_entity_id: workoutId,
            invitation_id: safeInvitationId,
            is_read: false,
            created_at: new Date().toISOString()
          });
        } catch (error) {
          console.error('[invitationPlugin] Ошибка при повторной отправке уведомления:', error);
        }
      }, 1000);
      
      return notificationId;
    } catch (error) {
      console.error('[invitationPlugin] Ошибка при отправке уведомления:', error);
    }
  };

  // Создать приглашение
  fastify.post('/invitations', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { workoutId, workout_uuid, email } = request.body as any;
    const actualWorkoutId = workoutId || workout_uuid;
    
    if (!actualWorkoutId || !email) {
      return reply.status(400).send({ error: 'Не указан ID тренировки или email пользователя' });
    }

    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    try {
      // Проверяем, что пользователь имеет права на тренировку
      const [workout] = await databaseProvider.select(knex, {
        table: 'workouts',
        schema: SCHEMA,
        columns: ['created_by'],
        where: eq('workout_uuid', actualWorkoutId)
      });

      if (!workout) {
        return reply.status(404).send({ error: 'Тренировка не найдена' });
      }

      if (workout.created_by !== user.uuid) {
        return reply.status(403).send({ error: 'Нет прав на приглашение участников' });
      }

      // Находим пользователя по email
      const [recipient] = await databaseProvider.select(knex, {
        table: 'users',
        schema: SCHEMA,
        columns: ['user_uuid'],
        where: eq('email', email)
      });

      if (!recipient) {
        return reply.status(404).send({ error: 'Пользователь с таким email не найден' });
      }

      // Проверяем, нет ли уже активного приглашения
      const [existingInvitation] = await databaseProvider.select(knex, {
        table: 'invitations',
        schema: SCHEMA,
        columns: ['invitation_uuid'],
        where: and([
          eq('workout_uuid', actualWorkoutId),
          eq('recipient_uuid', recipient.user_uuid),
          eq('status', 'pending')
        ])
      });

      if (existingInvitation) {
        return reply.status(409).send({ error: 'Приглашение уже отправлено' });
      }

      // Создаем приглашение
      let invitation;
      try {
        const result = await databaseProvider.insert(knex, {
          table: 'invitations',
          schema: SCHEMA,
          values: [{
            workout_uuid: actualWorkoutId,
            sender_uuid: user.uuid,
            recipient_uuid: recipient.user_uuid,
            status: 'pending',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 дней
          }],
          returning: ['invitation_uuid', 'recipient_uuid', 'sender_uuid'] // Явно запрашиваем возврат ID
        });
        
        invitation = result && result.length > 0 ? result[0] : null;
        console.log('[invitationPlugin] Результат создания приглашения:', result);
        console.log('[invitationPlugin] Создано приглашение:', invitation);
      } catch (insertError) {
        console.error('[invitationPlugin] Ошибка при вставке приглашения:', insertError);
        return reply.status(500).send({ error: 'Ошибка при создании приглашения в базе данных' });
      }

      // Если ID приглашения не удалось получить при вставке, 
      // пробуем найти его по другим параметрам
      if (!invitation || !invitation.invitation_uuid) {
        console.warn('[invitationPlugin] ID приглашения не получен, пробуем найти его в базе');
        
        try {
          // Ищем только что созданное приглашение
          const [foundInvitation] = await databaseProvider.select(knex, {
            table: 'invitations',
            schema: SCHEMA,
            columns: ['invitation_uuid'],
            where: and([
              eq('workout_uuid', actualWorkoutId),
              eq('recipient_uuid', recipient.user_uuid),
              eq('sender_uuid', user.uuid),
              eq('status', 'pending')
            ]),
            orderBy: [{ column: 'created_at', direction: 'desc' }],
            limit: 1
          });
          
          if (foundInvitation && foundInvitation.invitation_uuid) {
            console.log('[invitationPlugin] Найдено приглашение по параметрам:', foundInvitation);
            invitation = foundInvitation;
          } else {
            console.error('[invitationPlugin] Не удалось найти приглашение');
          }
        } catch (findError) {
          console.error('[invitationPlugin] Ошибка при поиске приглашения:', findError);
        }
      }

      // Уведомляем получателя с использованием улучшенной функции
      const [workoutInfo] = await databaseProvider.select(knex, {
        table: 'workouts',
        schema: SCHEMA,
        columns: ['title'],
        where: eq('workout_uuid', actualWorkoutId)
      });

      const [senderInfo] = await databaseProvider.select(knex, {
        table: 'users',
        schema: SCHEMA,
        columns: ['display_name', 'username'],
        where: eq('user_uuid', user.uuid)
      });

      const senderName = senderInfo.display_name || senderInfo.username;
      await sendInvitationNotification(
        fastify,
        recipient.user_uuid,
        senderName,
        workoutInfo.title,
        invitation?.invitation_uuid,
        actualWorkoutId
      );

      return { invitation };
    } catch (error) {
      console.error('Ошибка при создании приглашения:', error);
      return reply.status(500).send({ error: 'Ошибка при создании приглашения' });
    }
  });
};

export default invitationPlugin; 
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from '../db/queryBuilders/filters';
import { DatabaseService } from '../db/services/databaseService';
import { AuthenticatedFastifyInstance } from '../../types/fastify';
import { AuthStore } from '../services/AuthStore';

const SCHEMA = 'workout_app';

const notificationRoutes: FastifyPluginAsync = async (fastify: AuthenticatedFastifyInstance) => {
  const authStore = AuthStore.getInstance();

  const getUserFromRequest = (request: FastifyRequest) => {
    const signature = request.cookies.auth_token || 
                    request.headers.authorization?.replace('Bearer ', '');
    if (!signature) return null;
    return authStore.getUser(signature);
  };

  // Проверка доступности API уведомлений
  fastify.get('/notifications/status', async (request: FastifyRequest, reply: FastifyReply) => {
    return { status: 'ok', message: 'API уведомлений работает' };
  });

  // Получение всех уведомлений для текущего пользователя
  fastify.get('/notifications', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    try {
      // Получаем приглашения, которые будут отображаться как уведомления
      const invitations = await databaseProvider.select(knex, {
        table: 'invitations',
        schema: SCHEMA,
        columns: [
          'invitation_uuid',
          'workout_uuid', 
          'sender_uuid',
          'recipient_uuid',
          'status',
          'created_at'
        ],
        where: eq('recipient_uuid', user.uuid),
        orderBy: [{ column: 'created_at', direction: 'desc' }]
      });

      // Преобразуем приглашения в формат уведомлений
      const notifications = await Promise.all(invitations.map(async (invitation: any) => {
        // Получаем информацию о тренировке
        const [workout] = await databaseProvider.select(knex, {
          table: 'workouts',
          schema: SCHEMA,
          columns: ['title'],
          where: eq('workout_uuid', invitation.workout_uuid)
        });

        // Получаем информацию об отправителе
        const [sender] = await databaseProvider.select(knex, {
          table: 'users',
          schema: SCHEMA,
          columns: ['display_name', 'username'],
          where: eq('user_uuid', invitation.sender_uuid)
        });

        const senderName = sender ? (sender.display_name || sender.username) : 'Пользователь';
        const workoutTitle = workout ? workout.title : 'тренировку';
        const statusText = 
          invitation.status === 'pending' ? 'Ожидает ответа' :
          invitation.status === 'accepted' ? 'Принято' :
          invitation.status === 'declined' ? 'Отклонено' : 'Истекло';

        return {
          id: invitation.invitation_uuid,
          title: 'Приглашение на тренировку',
          message: `${senderName} приглашает вас принять участие в тренировке "${workoutTitle}"`,
          status: invitation.status,
          statusText: statusText,
          type: 'invitation',
          workoutId: invitation.workout_uuid,
          senderId: invitation.sender_uuid,
          senderName: senderName,
          workoutTitle: workoutTitle,
          created_at: invitation.created_at,
          is_read: invitation.status !== 'pending' // считаем прочитанным, если не в ожидании
        };
      }));

      return { notifications };
    } catch (error) {
      console.error('Ошибка при получении уведомлений:', error);
      return reply.status(500).send({ error: 'Ошибка при получении уведомлений' });
    }
  });

  // Отметка приглашения как принятого
  fastify.post('/notifications/accept', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { invitationId } = request.body as any;
    if (!invitationId) {
      return reply.status(400).send({ error: 'ID приглашения не указан' });
    }

    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    try {
      console.log(`[POST /notifications/accept] Принятие приглашения: id=${invitationId}, user=${user.uuid}`);
      
      // Сначала получаем информацию о приглашении
      const [existingInvitation] = await databaseProvider.select(knex, {
        table: 'invitations',
        schema: SCHEMA,
        columns: ['invitation_uuid', 'workout_uuid', 'sender_uuid', 'status'],
        where: and([
          eq('invitation_uuid', invitationId),
          eq('recipient_uuid', user.uuid)
        ])
      });

      if (!existingInvitation) {
        console.error(`[POST /notifications/accept] Приглашение не найдено: id=${invitationId}`);
        return reply.status(404).send({ error: 'Приглашение не найдено' });
      }

      if (existingInvitation.status !== 'pending') {
        console.log(`[POST /notifications/accept] Приглашение уже обработано, статус: ${existingInvitation.status}`);
        return reply.status(400).send({ error: 'Приглашение уже обработано ранее' });
      }

      // Проверяем, не является ли пользователь уже участником тренировки
      const [existingParticipant] = await databaseProvider.select(knex, {
        table: 'workout_participants',
        schema: SCHEMA,
        columns: ['user_uuid'],
        where: and([
          eq('workout_uuid', existingInvitation.workout_uuid),
          eq('user_uuid', user.uuid)
        ])
      });

      if (existingParticipant) {
        console.log(`[POST /notifications/accept] Пользователь уже участвует в тренировке: workoutId=${existingInvitation.workout_uuid}`);
        
        // Просто обновляем статус приглашения, но не добавляем пользователя снова
        await databaseProvider.query(
          `UPDATE ${SCHEMA}.invitations SET status = 'accepted', updated_at = NOW() WHERE invitation_uuid = $1 AND recipient_uuid = $2`,
          [invitationId, user.uuid]
        );
        
        return { success: true, alreadyParticipant: true };
      }

      // Обновляем статус приглашения на "принятое" через прямой SQL запрос
      await databaseProvider.query(
        `UPDATE ${SCHEMA}.invitations SET status = 'accepted', updated_at = NOW() WHERE invitation_uuid = $1 AND recipient_uuid = $2`,
        [invitationId, user.uuid]
      );

      // Добавляем пользователя как участника тренировки
      await databaseProvider.insert(knex, {
        table: 'workout_participants',
        schema: SCHEMA,
        values: [{
          workout_uuid: existingInvitation.workout_uuid,
          user_uuid: user.uuid,
          role: 'participant'
        }]
      });

      // Получаем информацию о тренировке для уведомления
      const [workoutInfo] = await databaseProvider.select(knex, {
        table: 'workouts',
        schema: SCHEMA,
        columns: ['title', 'created_by'],
        where: eq('workout_uuid', existingInvitation.workout_uuid)
      });

      // Уведомляем отправителя приглашения, если есть сервис уведомлений
      if (fastify.notificationService) {
        const [userInfo] = await databaseProvider.select(knex, {
          table: 'users',
          schema: SCHEMA,
          columns: ['display_name', 'username'],
          where: eq('user_uuid', user.uuid)
        });

        const userName = userInfo.display_name || userInfo.username;
        
        // Уведомляем создателя приглашения
        fastify.notificationService.notifyUser(
          existingInvitation.sender_uuid,
          `${userName} принял приглашение на тренировку "${workoutInfo.title}"`,
          'Приглашение принято',
          'success'
        );
        
        // Если создатель тренировки отличается от отправителя приглашения,
        // уведомляем и создателя тренировки
        if (workoutInfo.created_by !== existingInvitation.sender_uuid) {
          fastify.notificationService.notifyUser(
            workoutInfo.created_by,
            `${userName} присоединился к тренировке "${workoutInfo.title}"`,
            'Новый участник',
            'info'
          );
        }
      }

      console.log(`[POST /notifications/accept] Приглашение успешно принято: id=${invitationId}`);
      return { success: true };
    } catch (error) {
      console.error('Ошибка при принятии приглашения:', error);
      // Выводим больше информации об ошибке для отладки
      const errorMessage = error instanceof Error 
        ? `${error.message}\n${error.stack}` 
        : JSON.stringify(error);
      console.error('Детали ошибки:', errorMessage);
      
      return reply.status(500).send({ error: 'Ошибка при принятии приглашения', details: errorMessage });
    }
  });

  // Отметка приглашения как отклоненного
  fastify.post('/notifications/decline', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { invitationId } = request.body as any;
    if (!invitationId) {
      return reply.status(400).send({ error: 'ID приглашения не указан' });
    }

    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    try {
      console.log(`[POST /notifications/decline] Отклонение приглашения: id=${invitationId}, user=${user.uuid}`);
      
      // Проверяем существование приглашения
      const [invitation] = await databaseProvider.select(knex, {
        table: 'invitations',
        schema: SCHEMA,
        columns: ['invitation_uuid', 'status', 'workout_uuid', 'sender_uuid'],
        where: and([
          eq('invitation_uuid', invitationId),
          eq('recipient_uuid', user.uuid)
        ])
      });
      
      if (!invitation) {
        console.error(`[POST /notifications/decline] Приглашение не найдено: id=${invitationId}`);
        return reply.status(404).send({ error: 'Приглашение не найдено' });
      }
      
      if (invitation.status !== 'pending') {
        console.log(`[POST /notifications/decline] Приглашение уже обработано, статус: ${invitation.status}`);
        return reply.status(400).send({ error: 'Приглашение уже обработано ранее' });
      }

      // Обновляем статус приглашения на "отклоненное" через прямой SQL запрос
      const result = await databaseProvider.query(
        `UPDATE ${SCHEMA}.invitations SET status = 'declined', updated_at = NOW() WHERE invitation_uuid = $1 AND recipient_uuid = $2`,
        [invitationId, user.uuid]
      );
      
      console.log(`[POST /notifications/decline] Результат обновления:`, result.rowCount);

      // Получаем информацию о тренировке для уведомления
      const [workoutInfo] = await databaseProvider.select(knex, {
        table: 'workouts',
        schema: SCHEMA,
        columns: ['title', 'created_by'],
        where: eq('workout_uuid', invitation.workout_uuid)
      });

      // Уведомляем отправителя приглашения, если есть сервис уведомлений
      if (fastify.notificationService) {
        const [userInfo] = await databaseProvider.select(knex, {
          table: 'users',
          schema: SCHEMA,
          columns: ['display_name', 'username'],
          where: eq('user_uuid', user.uuid)
        });

        if (userInfo && workoutInfo) {
          const userName = userInfo.display_name || userInfo.username;
          
          // Уведомляем создателя приглашения
          fastify.notificationService.notifyUser(
            invitation.sender_uuid,
            `${userName} отклонил приглашение на тренировку "${workoutInfo.title}"`,
            'Приглашение отклонено',
            'info'
          );
          
          // Если создатель тренировки отличается от отправителя приглашения,
          // уведомляем и создателя тренировки
          if (workoutInfo.created_by !== invitation.sender_uuid) {
            fastify.notificationService.notifyUser(
              workoutInfo.created_by,
              `${userName} отклонил приглашение на тренировку "${workoutInfo.title}"`,
              'Приглашение отклонено',
              'info'
            );
          }
        }
      }

      console.log(`[POST /notifications/decline] Приглашение успешно отклонено: id=${invitationId}`);
      return { success: true };
    } catch (error) {
      console.error('Ошибка при отклонении приглашения:', error);
      // Выводим больше информации об ошибке для отладки
      const errorMessage = error instanceof Error 
        ? `${error.message}\n${error.stack}` 
        : JSON.stringify(error);
      console.error('Детали ошибки:', errorMessage);
      
      return reply.status(500).send({ error: 'Ошибка при отклонении приглашения', details: errorMessage });
    }
  });
};

export default notificationRoutes; 
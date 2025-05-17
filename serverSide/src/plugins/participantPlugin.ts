import { FastifyPluginAsync } from 'fastify';
import { eq, and } from '../db/queryBuilders/filters';
import { DatabaseService } from '../db/services/databaseService';
import {  AuthenticatedFastifyInstance } from '../../types/fastify';

const SCHEMA = 'workout_app';

const participantPlugin: FastifyPluginAsync = async (fastify: AuthenticatedFastifyInstance) => {
  // Получение всех приглашений пользователя
  fastify.get('/invitations', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) {
      return reply.status(401).send({ error: 'Пользователь не авторизован' });
    }
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    const invitations = await databaseProvider.select(knex, {
      table: 'invitations',
      schema: SCHEMA,
      columns: ['*'],
      where: eq('recipient_uuid', user.uuid),
      orderBy: [{ column: 'created_at', direction: 'desc' }]
    });
    return { invitations };
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
      columns: ['created_by'],
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

    // Создать приглашение
    console.log(`[POST /invitations] Создаем новое приглашение`);
    try {
      const [invitation] = await databaseProvider.insert(knex, {
        table: 'invitations',
        schema: SCHEMA,
        values: [{
          workout_uuid,
          sender_uuid: user.uuid,
          recipient_uuid: targetRecipientUuid,
          status: 'pending',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }]
      });
      
      // Отправляем уведомление получателю, если он онлайн
      if (fastify.notificationService) {
        console.log(`[POST /invitations] Отправляем уведомление получателю ${targetRecipientUuid}`);
        fastify.notificationService.notifyUser(targetRecipientUuid, `Вам пришло приглашение на тренировку!`);
      }
      
      console.log(`[POST /invitations] Приглашение успешно создано`);
      return { invitation };
    } catch (error) {
      console.error('[POST /invitations] Ошибка при создании приглашения:', error);
      return reply.status(500).send({ error: 'Ошибка при создании приглашения' });
    }
  });

  // Принять/отклонить приглашение
  fastify.patch('/invitations/:id', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    const { id } = req.params as any;
    const { accept } = req.body as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Найти приглашение
    const [invitation] = await databaseProvider.select(knex, {
      table: 'invitations',
      schema: SCHEMA,
      columns: ['*'],
      where: and([
        eq('invitation_uuid', id),
        eq('recipient_uuid', user.uuid),
        eq('status', 'pending')
      ])
    });
    if (!invitation) return reply.status(404).send({ error: 'Приглашение не найдено или уже обработано' });

    // Обновить статус приглашения
    await databaseProvider.update(knex, {
      table: 'invitations',
      schema: SCHEMA,
      values: { status: accept ? 'accepted' : 'declined' },
      where: eq('invitation_uuid', id)
    });

    // Если принято — добавить участника
    if (accept) {
      await databaseProvider.insert(knex, {
        table: 'workout_participants',
        schema: SCHEMA,
        values: [{
          workout_uuid: invitation.workout_uuid,
          user_uuid: user.uuid,
          role: 'participant'
        }]
      });
      // Уведомляем отправителя приглашения, если он онлайн
      if (fastify.notificationService) {
        fastify.notificationService.notifyUser(invitation.sender_uuid, `Пользователь ${user.username || user.uuid} принял ваше приглашение!`);
      }
    }
    return { ok: true };
  });
};

export default participantPlugin; 
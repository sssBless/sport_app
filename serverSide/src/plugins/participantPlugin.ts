import { FastifyPluginAsync } from 'fastify';
import { eq, and } from '../db/queryBuilders/filters';
import { DatabaseService } from '../db/services/databaseService';
const SCHEMA = 'workout_app';

const participantPlugin: FastifyPluginAsync = async (fastify) => {
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
    const { workout_uuid, recipient_uuid } = req.body as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Проверка: только создатель может приглашать
    const [creator] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['role'],
      where: and([
        eq('workout_uuid', workout_uuid),
        eq('user_uuid', user.uuid),
        eq('role', 'creator')
      ])
    });
    if (!creator) return reply.status(403).send({ error: 'Нет прав' });

    // Проверка: не приглашать самого себя и не приглашать уже участвующего
    if (recipient_uuid === user.uuid) return reply.status(400).send({ error: 'Нельзя пригласить себя' });
    const [alreadyParticipant] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['user_uuid'],
      where: and([
        eq('workout_uuid', workout_uuid),
        eq('user_uuid', recipient_uuid)
      ])
    });
    if (alreadyParticipant) return reply.status(400).send({ error: 'Пользователь уже участник' });

    // Создать приглашение
    const [invitation] = await databaseProvider.insert(knex, {
      table: 'invitations',
      schema: SCHEMA,
      values: [{
        workout_uuid,
        sender_uuid: user.uuid,
        recipient_uuid,
        status: 'pending',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }]
    });
    // Отправляем уведомление получателю, если он онлайн
    if (fastify.notificationService) {
      fastify.notificationService.notifyUser(recipient_uuid, `Вам пришло приглашение на тренировку!`);
    }
    return { invitation };
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
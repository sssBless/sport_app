import { FastifyPluginAsync } from 'fastify';
import { eq, and } from '../db/queryBuilders/filters';
import { DatabaseService } from '../db/services/databaseService';
const SCHEMA = 'workout_app';

const workoutPlugin: FastifyPluginAsync = async (fastify) => {
  // Получение всех тренировок пользователя (creator или participant)
  fastify.get('/workouts', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) {
      return reply.status(401).send({ error: 'Пользователь не авторизован' });
    }
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    const workouts = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['workouts.*', 'workout_participants.role'],
      joins: [{
        type: 'inner',
        table: 'workout_participants',
        on: ['workouts.workout_uuid', '=', 'workout_participants.workout_uuid']
      }],
      where: eq('workout_participants.user_uuid', user.uuid),
      orderBy: [{ column: 'workouts.scheduled_time', direction: 'desc' }]
    });
    return { workouts };
  });

  // Получение деталей тренировки (упражнения, участники, порядок, повторы, отдых)
  fastify.get('/workouts/:id', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    const { id } = req.params as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Получаем тренировку
    const [workout] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['*'],
      where: eq('workout_uuid', id)
    });
    if (!workout) return reply.status(404).send({ error: 'Тренировка не найдена' });

    // Получаем упражнения
    const exercises = await databaseProvider.select(knex, {
      table: 'workout_exercises',
      schema: SCHEMA,
      columns: ['*'],
      where: eq('workout_uuid', id),
      orderBy: [{ column: 'sort_order', direction: 'asc' }]
    });

    // Получаем участников
    const participants = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['*'],
      where: eq('workout_uuid', id)
    });

    return { workout, exercises, participants };
  });

  // Создание тренировки
  fastify.post('/workouts', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    const { title, description, scheduled_time, exercises } = req.body as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Создаем тренировку
    const [workout] = await databaseProvider.insert(knex, {
      table: 'workouts',
      schema: SCHEMA,
      values: [{
        title,
        description,
        created_by: user.uuid,
        scheduled_time,
        is_completed: false
      }]
    });

    // Добавляем создателя как участника
    await databaseProvider.insert(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      values: [{
        workout_uuid: workout.workout_uuid,
        user_uuid: user.uuid,
        role: 'creator'
      }]
    });

    // Добавляем упражнения
    if (Array.isArray(exercises)) {
      const workoutExercises = exercises.map((ex: any, idx: number) => ({
        workout_uuid: workout.workout_uuid,
        exercise_id: ex.exercise_id,
        sets: ex.sets,
        reps: ex.reps,
        rest_seconds: ex.rest_seconds,
        sort_order: idx + 1
      }));
      if (workoutExercises.length) {
        await databaseProvider.insert(knex, {
          table: 'workout_exercises',
          schema: SCHEMA,
          values: workoutExercises
        });
      }
    }
    return { workout };
  });

  // Изменение тренировки (имя, описание, время)
  fastify.patch('/workouts/:id', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    const { id } = req.params as any;
    const updates = req.body as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Только создатель может менять
    const [creator] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['role'],
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', user.uuid),
        eq('role', 'creator')
      ])
    });
    if (!creator) return reply.status(403).send({ error: 'Нет прав' });

    const [workout] = await databaseProvider.update(knex, {
      table: 'workouts',
      schema: SCHEMA,
      values: updates,
      where: eq('workout_uuid', id)
    });
    return { workout };
  });

  // Изменение упражнения в тренировке (повторы, отдых, порядок)
  fastify.patch('/workouts/:id/exercises/:exerciseId', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    const { id, exerciseId } = req.params as any;
    const updates = req.body as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Проверка: только участник тренировки
    const [participant] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['role'],
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', user.uuid)
      ])
    });
    if (!participant) return reply.status(403).send({ error: 'Нет доступа' });

    const [exercise] = await databaseProvider.update(knex, {
      table: 'workout_exercises',
      schema: SCHEMA,
      values: updates,
      where: and([
        eq('workout_uuid', id),
        eq('exercise_id', exerciseId)
      ])
    });
    return { exercise };
  });

  // Удаление тренировки (только создатель)
  fastify.delete('/workouts/:id', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    const { id } = req.params as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Только создатель может удалять
    const [creator] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['role'],
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', user.uuid),
        eq('role', 'creator')
      ])
    });
    if (!creator) return reply.status(403).send({ error: 'Нет прав' });

    await databaseProvider.delete(knex, {
      table: 'workouts',
      schema: SCHEMA,
      where: eq('workout_uuid', id)
    });
    return { ok: true };
  });

  // Удаление участника (только создатель)
  fastify.delete('/workouts/:id/participants/:userId', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    const { id, userId } = req.params as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Только создатель может удалять участников
    const [creator] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['role'],
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', user.uuid),
        eq('role', 'creator')
      ])
    });
    if (!creator) return reply.status(403).send({ error: 'Нет прав' });

    await databaseProvider.delete(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', userId),
        eq('role', 'participant')
      ])
    });
    return { ok: true };
  });

  // Выйти из тренировки (удалить себя из участников)
  fastify.delete('/workouts/:id/leave', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    const { id } = req.params as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    await databaseProvider.delete(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', user.uuid),
        eq('role', 'participant')
      ])
    });
    return { ok: true };
  });

  // Завершение тренировки (только создатель)
  fastify.patch('/workouts/:id/complete', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    const { id } = req.params as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Проверка: только создатель
    const [creator] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['role'],
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', user.uuid),
        eq('role', 'creator')
      ])
    });
    if (!creator) return reply.status(403).send({ error: 'Нет прав' });

    // Завершаем тренировку
    const [workout] = await databaseProvider.update(knex, {
      table: 'workouts',
      schema: SCHEMA,
      values: {
        is_completed: true,
        completed_at: new Date().toISOString()
      },
      where: eq('workout_uuid', id)
    });

    // Получаем всех участников (кроме завершившего)
    const participants = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['user_uuid'],
      where: and([
        eq('workout_uuid', id)
      ])
    });

    // Уведомляем участников
    if (fastify.notificationService) {
      for (const p of participants) {
        if (p.user_uuid !== user.uuid) {
          fastify.notificationService.notifyUser(p.user_uuid, `Тренировка завершена!`);
        }
      }
    }

    return { workout };
  });

  // Завершение тренировки для себя (участника)
  fastify.patch('/workouts/:id/complete-self', { preHandler: fastify.authenticate }, async (req, reply) => {
    const user = req.user;
    if (!user) return reply.status(401).send({ error: 'Пользователь не авторизован' });
    const { id } = req.params as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Проверка: участник ли пользователь
    const [participant] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['role'],
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', user.uuid)
      ])
    });
    if (!participant) return reply.status(403).send({ error: 'Нет доступа' });

    // Завершаем тренировку для себя
    const [updated] = await databaseProvider.update(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      values: {
        is_completed: true,
        completed_at: new Date().toISOString()
      },
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', user.uuid)
      ])
    });

    return { participant: updated };
  });
};

export default workoutPlugin; 
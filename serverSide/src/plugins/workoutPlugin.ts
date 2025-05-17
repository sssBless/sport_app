import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, or, neq } from '../db/queryBuilders/filters';
import { DatabaseService } from '../db/services/databaseService';
import { AuthenticatedFastifyInstance } from '../../types/fastify';
import { AuthStore } from '../services/AuthStore';
import { Knex } from 'knex';
const SCHEMA = 'workout_app';

interface WorkoutResult {
  workout_uuid: string;
  title: string;
  description: string | null;
  created_by: string;
  scheduled_time: Date;
  created_at: Date;
  is_completed: boolean;
  completed_at: Date | null;
  role: string | null;
  is_creator: boolean;
}

// Добавляем определение интерфейса для упражнений
interface Exercise {
  id: string;
  name: string;
  muscle_group?: string;
  sets: any[];
}

const workoutPlugin: FastifyPluginAsync = async (fastify: AuthenticatedFastifyInstance) => {
  const authStore = AuthStore.getInstance();

  const getUserFromRequest = (request: FastifyRequest) => {
    const signature = request.cookies.auth_token || 
                     request.headers.authorization?.replace('Bearer ', '');
    if (!signature) return null;
    return authStore.getUser(signature);
  };

  // Получение всех тренировок пользователя (creator или participant)
  fastify.get('/workouts', { 
    preHandler: fastify.authenticate 
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    console.log(`[GET /workouts] Получение тренировок для пользователя ${user.uuid}`);

    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    try {
      const workouts = await databaseProvider.select(knex, {
        table: 'workouts',
        schema: SCHEMA,
        columns: ['workouts.*', 'workout_participants.role'],
        joins: [{
          type: 'left',
          table: 'workout_participants',
          on: ['workouts.workout_uuid', '=', 'workout_participants.workout_uuid']
        }],
        where: (qb) => {
          qb.where('workouts.created_by', '=', user.uuid)
            .orWhere('workout_participants.user_uuid', '=', user.uuid);
        },
        orderBy: [{ column: 'workouts.scheduled_time', direction: 'desc' }]
      });

      // Определяем роль на уровне JS и убираем дубликаты
      const workoutsMap = new Map();
      
      for (const w of workouts) {
        // Если уже есть тренировка с таким UUID, пропускаем дубликат
        if (workoutsMap.has(w.workout_uuid)) continue;
        
        // Определяем роль
        if (w.created_by === user.uuid) {
          w.role = 'creator';
        }
        
        workoutsMap.set(w.workout_uuid, w);
      }
      
      console.log(`[GET /workouts] Найдено уникальных тренировок: ${workoutsMap.size}`);
      
      // Проходим по каждой тренировке и получаем для нее полные данные через getWorkoutDetails
      const transformedWorkouts = await Promise.all(
        Array.from(workoutsMap.values()).map(async (workout) => {
          const details = await getWorkoutDetails(databaseProvider, knex, workout.workout_uuid, user.uuid);
          
          // Получаем участников тренировки
          const participants = await databaseProvider.select(knex, {
            table: 'workout_participants',
            schema: SCHEMA,
            columns: ['workout_participants.*', 'users.username', 'users.display_name', 'users.email'],
            joins: [{
              type: 'left',
              table: 'users',
              on: ['workout_participants.user_uuid', '=', 'users.user_uuid']
            }],
            where: eq('workout_participants.workout_uuid', workout.workout_uuid)
          });
          
          // Форматируем участников для клиента
          const formattedParticipants = participants.map((p: any) => ({
            id: p.user_uuid,
            name: p.display_name || p.username,
            email: p.email,
            role: p.role
          }));
          
          return {
            id: details.workout_uuid,
            name: details.title,
            description: details.description || '',
            date: details.scheduled_time,
            exercises: details.exercises || [],
            participants: formattedParticipants,
            createdBy: details.created_by,
            createdAt: details.created_at.toISOString(),
            updatedAt: details.created_at.toISOString(),
            is_completed: details.is_completed,
            completed_at: details.completed_at
          };
        })
      );
      
      console.log(`[GET /workouts] Отправляем ответ с ${transformedWorkouts.length} тренировками`);
      
      return { workouts: transformedWorkouts };
    } catch (error) {
      console.error('[GET /workouts] Ошибка:', error);
      throw error;
    }
  });

  // Получение деталей тренировки (упражнения, участники, порядок, повторы, отдых)
  fastify.get('/workouts/:id', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
    console.log(`[GET /workouts/:id] Запрос деталей тренировки: id=${id}, user=${user.uuid}`);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Получаем информацию о тренировке для проверки прав
    console.log(`Проверяем права для тренировки ${id} и пользователя ${user.uuid}`);
    
    const [workoutInfo] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by'],
      where: eq('workout_uuid', id)
    });
    
    console.log('Информация о тренировке:', workoutInfo);
    
    if (!workoutInfo) {
      console.log('Тренировка не найдена');
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }
    
    // Простая проверка: пользователь является создателем тренировки
    const isCreator = workoutInfo.created_by === user.uuid;
    console.log(`Пользователь ${user.uuid} создатель тренировки: ${isCreator}`);
    
    if (!isCreator) {
      // Проверяем, является ли пользователь участником тренировки
      const [participant] = await databaseProvider.select(knex, {
        table: 'workout_participants',
        schema: SCHEMA,
        columns: ['role'],
        where: and([
          eq('workout_uuid', id),
          eq('user_uuid', user.uuid)
        ])
      });
      
      if (!participant) {
        console.log('Отказано в доступе: пользователь не является ни создателем, ни участником');
        return reply.status(403).send({ error: 'Нет прав на просмотр тренировки' });
      }
      
      console.log(`Пользователь ${user.uuid} является участником тренировки с ролью: ${participant.role}`);
    }
    
    console.log('Проверка прав успешна, продолжаем обработку');

    // Получаем все детали тренировки с упражнениями через общую функцию
    const workoutDetails = await getWorkoutDetails(databaseProvider, knex, id, user.uuid);
    
    // Получаем участников тренировки
    const participants = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['workout_participants.*', 'users.username', 'users.display_name', 'users.email'],
      joins: [{
        type: 'left',
        table: 'users',
        on: ['workout_participants.user_uuid', '=', 'users.user_uuid']
      }],
      where: eq('workout_participants.workout_uuid', id)
    });
    
    // Форматируем участников для клиента
    const formattedParticipants = participants.map((p: any) => ({
      id: p.user_uuid,
      name: p.display_name || p.username,
      email: p.email,
      role: p.role
    }));
    
    console.log(`[GET /workouts/:id] Найдено ${formattedParticipants.length} участников`);
    
    // Форматируем ответ для клиента в нужном формате
    const response = {
      id: workoutDetails.workout_uuid,
      name: workoutDetails.title,
      description: workoutDetails.description || '',
      exercises: workoutDetails.exercises || [],
      participants: formattedParticipants,
      createdBy: workoutDetails.created_by,
      createdAt: workoutDetails.created_at.toISOString(),
      updatedAt: workoutDetails.created_at.toISOString(),
      date: workoutDetails.scheduled_time,
      is_completed: workoutDetails.is_completed,
      completed_at: workoutDetails.completed_at,
      is_creator: workoutDetails.is_creator
    };
    
    console.log('[GET /workouts/:id] Отправляем ответ клиенту:', response);
    
    return response;
  });

  // Создание тренировки
  fastify.post('/workouts', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { title, description, scheduled_time, exercises } = request.body as any;
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

    // Добавляем подходы для упражнений
    if (Array.isArray(exercises)) {
      let sortOrder = 1;
      const workoutSets = [];

      // Для каждого упражнения создаем указанное количество подходов
      for (const ex of exercises) {
        const exerciseId = ex.exercise_id;
        const setsCount = ex.sets || 1;
        const reps = ex.reps || 10;
        const weight = ex.weight || 0;
        const restSeconds = ex.rest_seconds || 60;

        // Создаем указанное количество подходов для упражнения
        for (let i = 0; i < setsCount; i++) {
          workoutSets.push({
            workout_uuid: workout.workout_uuid,
            exercise_id: exerciseId,
            reps: reps,
            weight: weight,
            rest_seconds: restSeconds,
            sort_order: sortOrder++,
            set_number: i + 1,
            is_completed: false
          });
        }
      }

      // Сохраняем все подходы в базу
      if (workoutSets.length > 0) {
        await databaseProvider.insert(knex, {
          table: 'workout_sets',
          schema: SCHEMA,
          values: workoutSets
        });
      }
    }
    
    // Возвращаем полную информацию о тренировке в формате, совместимом с клиентом
    const workoutDetails = await getWorkoutDetails(databaseProvider, knex, workout.workout_uuid, user.uuid);
    
    return { 
      id: workoutDetails.workout_uuid,
      name: workoutDetails.title,
      description: workoutDetails.description || '',
      exercises: workoutDetails.exercises || [],
      participants: [], // Добавляем пустой массив участников
      createdBy: workoutDetails.created_by,
      createdAt: workoutDetails.created_at.toISOString(),
      updatedAt: workoutDetails.created_at.toISOString(),
      date: workoutDetails.scheduled_time,
      is_completed: workoutDetails.is_completed,
      completed_at: workoutDetails.completed_at,
      is_creator: true
    };
  });

  // Вспомогательная функция для получения деталей тренировки
  const getWorkoutDetails = async (databaseProvider: any, knex: any, workoutId: string, userId: string) => {
    console.log(`[getWorkoutDetails] Получаем детали тренировки: workoutId=${workoutId}, userId=${userId}`);
    
    // Получаем информацию о тренировке
    const [workout] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['*'],
      where: eq('workout_uuid', workoutId)
    });
    
    console.log('[getWorkoutDetails] Информация о тренировке:', workout);
    
    // Получаем информацию о роли пользователя
    const [participant] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['role'],
      where: and([
        eq('workout_uuid', workoutId),
        eq('user_uuid', userId)
      ])
    });
    
    console.log('[getWorkoutDetails] Информация о роли:', participant);
    
    // Получаем все подходы для тренировки
    console.log('[getWorkoutDetails] Запрашиваем подходы для тренировки...');
    const sets = await databaseProvider.select(knex, {
      table: 'workout_sets',
      schema: SCHEMA,
      columns: [
        'workout_sets.*', 
        'exercises.name', 
        'exercises.muscle_group', 
        'exercises.description as exercise_description'
      ],
      joins: [{
        type: 'inner',
        table: 'exercises',
        on: ['workout_sets.exercise_id', '=', 'exercises.exercise_id']
      }],
      where: eq('workout_uuid', workoutId),
      orderBy: [{ column: 'sort_order', direction: 'asc' }]
    });
    
    console.log('[getWorkoutDetails] Полученные подходы:', sets);
    
    // Группируем подходы по упражнениям
    const exercisesMap = new Map();
    
    // Группируем подходы по упражнениям
    sets.forEach((set: any) => {
      if (!exercisesMap.has(set.exercise_id)) {
        exercisesMap.set(set.exercise_id, {
          id: String(set.exercise_id),
          name: set.name,
          muscle_group: set.muscle_group,
          sets: []
        });
      }
      
      // Добавляем подход в группу для этого упражнения
      exercisesMap.get(set.exercise_id).sets.push({
        id: set.set_uuid,
        exercise_id: set.exercise_id,
        reps: set.reps,
        weight: set.weight,
        rest_seconds: set.rest_seconds,
        is_completed: set.is_completed,
        set_number: set.set_number,
        notes: set.notes
      });
    });
    
    // Преобразуем Map в массив упражнений
    const formattedExercises = Array.from(exercisesMap.values());
    
    console.log('[getWorkoutDetails] Сгруппированные упражнения:', formattedExercises);
    
    // Если упражнений нет, возвращаем пустой массив
    if (formattedExercises.length === 0) {
      console.log('[getWorkoutDetails] Упражнений не найдено для тренировки', workoutId);
    }
    
    const result = {
      ...workout,
      role: participant?.role || null,
      is_creator: participant?.role === 'creator' || workout.created_by === userId,
      exercises: formattedExercises
    };
    
    console.log('[getWorkoutDetails] Результат:', result);
    
    return result;
  };

  // Изменение тренировки (имя, описание, время)
  fastify.patch('/workouts/:id', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
    const updates = request.body as any;
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
        eq('user_uuid', user.uuid)
      ])
    });
    
    // Проверяем, что пользователь - участник тренировки
    if (!creator) return reply.status(403).send({ error: 'Нет доступа к тренировке' });
    
    // Проверяем, что пользователь - создатель, если да - продолжаем
    const isCreator = creator.role === 'creator' || user.uuid === (await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by'],
      where: eq('workout_uuid', id)
    }))[0]?.created_by;
    
    if (!isCreator) return reply.status(403).send({ error: 'Нет прав на редактирование' });

    const [workout] = await databaseProvider.update(knex, {
      table: 'workouts',
      schema: SCHEMA,
      values: updates,
      where: eq('workout_uuid', id)
    });
    return { workout };
  });

  // Изменение упражнения в тренировке (повторы, отдых, порядок)
  fastify.patch('/workouts/:id/exercises/:exerciseId', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id, exerciseId } = request.params as any;
    const updates = request.body as any;
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
      table: 'workout_sets',
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
  fastify.delete('/workouts/:id', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
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
  fastify.delete('/workouts/:id/participants/:userId', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id, userId } = request.params as any;
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
  fastify.delete('/workouts/:id/leave', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
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
  fastify.patch('/workouts/:id/complete', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
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
      try {
        console.log('[complete] Отправка уведомлений о завершении тренировки участникам');
        
        // Получаем название тренировки для уведомления
        const [workoutInfo] = await databaseProvider.select(knex, {
          table: 'workouts',
          schema: SCHEMA,
          columns: ['title'],
          where: eq('workout_uuid', id)
        });
        
        const workoutTitle = workoutInfo ? workoutInfo.title : 'Тренировка';
        
        for (const p of participants) {
          if (p.user_uuid !== user.uuid) {
            fastify.notificationService.notifyUser(
              p.user_uuid, 
              `Тренировка "${workoutTitle}" была завершена`,
              'Тренировка завершена',
              'info',
              id
            );
            
            console.log(`[complete] Отправлено уведомление пользователю ${p.user_uuid}`);
          }
        }
      } catch (error) {
        console.error('[complete] Ошибка при отправке уведомлений:', error);
      }
    } else {
      console.warn('[complete] notificationService не найден');
    }

    // Возвращаем полную информацию о тренировке вместе с сохраненным прогрессом
    const workoutDetails = await getWorkoutDetails(databaseProvider, knex, id, user.uuid);
    return { 
      workout: {
        id: workoutDetails.workout_uuid,
        name: workoutDetails.title,
        date: workoutDetails.scheduled_time,
        notes: workoutDetails.description,
        is_completed: workoutDetails.is_completed,
        completed_at: workoutDetails.completed_at,
        exercises: workoutDetails.exercises || []
      }
    };
  });

  // Завершение тренировки для себя (участника)
  fastify.patch('/workouts/:id/complete-self', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
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

  // Обновление тренировки (имя, описание, время, упражнения)
  fastify.put('/workouts/:id', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
    const updates = request.body as any;
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Только создатель может менять
    console.log(`PUT: Проверяем права для тренировки ${id} и пользователя ${user.uuid}`);
    
    const [workoutInfo] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by'],
      where: eq('workout_uuid', id)
    });
    
    console.log('PUT: Информация о тренировке:', workoutInfo);
    
    if (!workoutInfo) {
      console.log('PUT: Тренировка не найдена');
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }
    
    // Простая проверка: пользователь является создателем тренировки
    const isCreator = workoutInfo.created_by === user.uuid;
    console.log(`PUT: Пользователь ${user.uuid} создатель тренировки: ${isCreator}`);
    
    if (!isCreator) {
      console.log('PUT: Отказано в доступе: пользователь не является создателем');
      return reply.status(403).send({ error: 'Нет прав на редактирование' });
    }
    
    console.log('PUT: Проверка прав успешна, продолжаем обработку');
    
    // Логируем входящие данные от клиента
    console.log('PUT: Полученные данные от клиента:', updates);
    
    try {
      // Начинаем транзакцию
      await knex.transaction(async (trx) => {
        // 1. Обновляем основную информацию о тренировке
        if (updates.name || updates.notes || updates.date) {
          const workoutUpdates: any = {};
          if (updates.name) workoutUpdates.title = updates.name;
          if (updates.notes) workoutUpdates.description = updates.notes;
          if (updates.date) workoutUpdates.scheduled_time = updates.date;
          
          console.log('PUT: Обновляем основную информацию:', workoutUpdates);

          await databaseProvider.update(trx, {
            table: 'workouts',
            schema: SCHEMA,
            values: workoutUpdates,
            where: eq('workout_uuid', id)
          });
        }

        // 2. Если есть упражнения, обновляем их
        if (updates.exercises && Array.isArray(updates.exercises)) {
          console.log('PUT: Обновляем упражнения, количество:', updates.exercises.length);
          
          // Получаем существующие упражнения из базы данных
          const availableExercises = await databaseProvider.select(knex, {
            table: 'exercises',
            schema: SCHEMA,
            columns: ['exercise_id', 'name']
          });
          
          console.log('PUT: Доступные упражнения в БД:', availableExercises);
          
          // Получаем текущие упражнения в тренировке
          const currentWorkoutExercises = await databaseProvider.select(trx, {
            table: 'workout_sets',
            schema: SCHEMA,
            columns: ['exercise_id', 'sort_order'],
            where: eq('workout_uuid', id)
          });
          
          console.log('PUT: Текущие упражнения в тренировке:', currentWorkoutExercises);
          
          // Вместо удаления всех упражнений, обрабатываем каждое отдельно
          const exercisesToInsert = await Promise.all(updates.exercises.map(async (ex: any, idx: number) => {
            console.log('PUT: Обрабатываем упражнение:', ex);
            
            let exerciseId: number;
            
            // Если идентификатор упражнения уже определен в клиенте
            if (ex.exercise_id) {
              exerciseId = ex.exercise_id;
              console.log(`PUT: Используем указанный exercise_id=${exerciseId}`);
            } 
            // Если упражнение имеет имя, ищем по имени
            else if (ex.name) {
              // Ищем среди доступных упражнений
              const found = availableExercises.find((e: any) => 
                e.name.toLowerCase() === ex.name.toLowerCase()
              );
              
              if (found) {
                exerciseId = found.exercise_id;
                console.log(`PUT: Найдено упражнение по имени: ${ex.name}, ID=${exerciseId}`);
              } else {
                try {
                  // Создаем новое упражнение
                  await databaseProvider.insert(trx, {
                    table: 'exercises',
                    schema: SCHEMA,
                    values: [{
                      name: ex.name,
                      muscle_group: ex.muscle_group || null,
                      description: ex.description || null
                    }]
                  });
                  
                  // Получаем ID нового упражнения
                  const [createdExercise] = await databaseProvider.select(trx, {
                    table: 'exercises',
                    schema: SCHEMA,
                    columns: ['exercise_id'],
                    where: eq('name', ex.name)
                  });
                  
                  exerciseId = createdExercise.exercise_id;
                  console.log(`PUT: Создано новое упражнение: ${ex.name}, ID=${exerciseId}`);
                } catch (err: any) {
                  // Если упражнение уже существует, получаем его ID
                  if (err.code === '23505') {
                    console.log(`PUT: Упражнение ${ex.name} уже существует, получаем его ID`);
                    const [existingEx] = await databaseProvider.select(trx, {
                      table: 'exercises',
                      schema: SCHEMA,
                      columns: ['exercise_id'],
                      where: eq('name', ex.name)
                    });
                    exerciseId = existingEx.exercise_id;
                  } else {
                    throw err;
                  }
                }
              }
            } else {
              // Если нет ни ID ни имени, используем ID 1 (первое упражнение)
              exerciseId = 1;
              console.log('PUT: Используем ID 1 для упражнения без имени');
            }
            
            // Обрабатываем sets - если это массив объектов, сериализуем его в JSON
            let setsValue;
            if (Array.isArray(ex.sets)) {
              // Сериализуем массив подходов в JSON
              setsValue = JSON.stringify(ex.sets);
              console.log(`PUT: Сериализуем sets в JSON: ${setsValue}`);
            } else {
              // Если sets - число или не определено, используем как есть
              setsValue = ex.sets || 3;
              console.log(`PUT: Используем sets как число: ${setsValue}`);
            }
            
            return {
              workout_uuid: id,
              exercise_id: exerciseId,
              sets: setsValue,
              reps: ex.reps || 10,
              rest_seconds: ex.rest_seconds || 60,
              sort_order: idx + 1
            };
          }));
          
          // Удаляем текущие упражнения и добавляем новые
          await databaseProvider.delete(trx, {
            table: 'workout_sets',
            schema: SCHEMA,
            where: eq('workout_uuid', id)
          });
          
          console.log('PUT: Добавляем упражнения:', exercisesToInsert);
          
          if (exercisesToInsert.length > 0) {
            await databaseProvider.insert(trx, {
              table: 'workout_sets',
              schema: SCHEMA,
              values: exercisesToInsert
            });
          }
        }
      });

      // Получаем обновленную тренировку
      const [updatedWorkout] = await databaseProvider.select(knex, {
        table: 'workouts',
        schema: SCHEMA,
        columns: ['*'],
        where: eq('workout_uuid', id)
      });

      // Получаем упражнения
      const exercises = await databaseProvider.select(knex, {
        table: 'workout_sets',
        schema: SCHEMA,
        columns: [
          'workout_sets.*', 
          'exercises.name', 
          'exercises.muscle_group', 
          'exercises.description as exercise_description'
        ],
        joins: [{
          type: 'inner',
          table: 'exercises',
          on: ['workout_sets.exercise_id', '=', 'exercises.exercise_id']
        }],
        where: eq('workout_uuid', id),
        orderBy: [{ column: 'sort_order', direction: 'asc' }]
      });

      // После успешной транзакции, получаем и возвращаем обновленные данные
      const workoutDetails = await getWorkoutDetails(databaseProvider, knex, id, user.uuid);
      
      return { 
        id: workoutDetails.workout_uuid,
        name: workoutDetails.title,
        date: workoutDetails.scheduled_time,
        notes: workoutDetails.description,
        is_completed: workoutDetails.is_completed,
        completed_at: workoutDetails.completed_at,
        exercises: workoutDetails.exercises
      };
    } catch (error) {
      console.error('Error updating workout:', error);
      return reply.status(500).send({ error: 'Ошибка при обновлении тренировки' });
    }
  });

  // Получение списка всех упражнений для добавления в тренировку
  fastify.get('/workout-exercises', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    try {
      const exercises = await databaseProvider.select(knex, {
        table: 'exercises',
        schema: SCHEMA,
        columns: ['*'],
        orderBy: [{ column: 'name', direction: 'asc' }]
      });

      return { 
        exercises: exercises.map((ex: any) => ({
          id: ex.exercise_id,
          name: ex.name,
          muscle_group: ex.muscle_group,
          description: ex.description
        }))
      };
    } catch (error) {
      console.error('Error fetching exercises:', error);
      return reply.status(500).send({ error: 'Ошибка при получении списка упражнений' });
    }
  });

  // Получение участников тренировки
  fastify.get('/workouts/:id/participants', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
    console.log(`[GET /workouts/:id/participants] Запрос участников тренировки: id=${id}, user=${user.uuid}`);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Проверяем доступ к тренировке
    const [workoutInfo] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by'],
      where: eq('workout_uuid', id)
    });
    
    if (!workoutInfo) {
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }
    
    // Получаем всех участников тренировки
    const participants = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['workout_participants.*', 'users.username', 'users.display_name', 'users.email'],
      joins: [{
        type: 'left',
        table: 'users',
        on: ['workout_participants.user_uuid', '=', 'users.user_uuid']
      }],
      where: eq('workout_participants.workout_uuid', id)
    });
    
    // Форматируем участников для клиента
    const formattedParticipants = participants.map((p: any) => ({
      id: p.user_uuid,
      name: p.display_name || p.username,
      email: p.email,
      role: p.role
    }));
    
    console.log(`[GET /workouts/:id/participants] Найдено ${formattedParticipants.length} участников`);
    
    return { participants: formattedParticipants };
  });
  
  // Обновление порядка упражнений
  fastify.put('/workouts/:id/exercises/order', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
    const { exercises } = request.body as any;
    
    console.log(`[PUT /workouts/:id/exercises/order] Обновление порядка упражнений: id=${id}, user=${user.uuid}`);
    console.log('Полученные упражнения:', exercises);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    // Проверяем права на редактирование тренировки
    const [workoutInfo] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by'],
      where: eq('workout_uuid', id)
    });
    
    if (!workoutInfo) {
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }
    
    // Только создатель может менять порядок упражнений
    if (workoutInfo.created_by !== user.uuid) {
      return reply.status(403).send({ error: 'Нет прав на редактирование тренировки' });
    }
    
    try {
      // Выполняем обновление в рамках транзакции
      await knex.transaction(async (trx) => {
        // Получаем текущие записи подходов упражнений
        const currentSets = await databaseProvider.select(trx, {
          table: 'workout_sets',
          schema: SCHEMA,
          columns: ['set_uuid', 'exercise_id', 'set_number', 'sort_order'],
          where: eq('workout_uuid', id),
          orderBy: [{ column: 'sort_order', direction: 'asc' }]
        });
        
        // Создаем карту подходов по упражнениям
        const exerciseSetsMap = new Map();
        currentSets.forEach((set: any) => {
          if (!exerciseSetsMap.has(set.exercise_id)) {
            exerciseSetsMap.set(set.exercise_id, []);
          }
          exerciseSetsMap.get(set.exercise_id).push(set);
        });
        
        // Сначала обновляем порядок на временные очень большие значения
        // чтобы избежать конфликтов при перестановке
        for (let i = 0; i < currentSets.length; i++) {
          const set = currentSets[i];
          await databaseProvider.query(
            `UPDATE ${SCHEMA}.workout_sets SET sort_order = $1 WHERE set_uuid = $2`,
            [1000000 + i, set.set_uuid]
          );
        }
        
        // Теперь обновляем на целевые значения
        let globalSortOrder = 1;
        
        // Для каждого упражнения в новом порядке, обновляем подходы
        for (const exercise of exercises) {
          const exerciseId = parseInt(exercise.id, 10);
          const exerciseSets = exerciseSetsMap.get(exerciseId) || [];
          
          // Сортируем подходы по их номерам
          exerciseSets.sort((a: any, b: any) => a.set_number - b.set_number);
          
          // Обновляем порядок для каждого подхода
          for (const set of exerciseSets) {
            await databaseProvider.query(
              `UPDATE ${SCHEMA}.workout_sets SET sort_order = $1 WHERE set_uuid = $2`,
              [globalSortOrder++, set.set_uuid]
            );
          }
        }
      });
      
      console.log(`[PUT /workouts/:id/exercises/order] Порядок упражнений обновлен`);
      
      // Получаем обновленные данные и возвращаем клиенту
      const updatedWorkout = await getWorkoutDetails(databaseProvider, knex, id, user.uuid);
      
      return { 
        exercises: updatedWorkout.exercises || [] 
      };
    } catch (error) {
      console.error('[PUT /workouts/:id/exercises/order] Ошибка при обновлении порядка:', error);
      return reply.status(500).send({ 
        error: 'Ошибка при обновлении порядка упражнений',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Начало тренировки
  fastify.post('/workouts/:id/start', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
    console.log(`[POST /workouts/:id/start] Начало тренировки: id=${id}, user=${user.uuid}`);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    // Проверка на существование тренировки и разрешение на участие
    const [workoutParticipant] = await databaseProvider.select(knex, {
      table: 'workout_participants',
      schema: SCHEMA,
      columns: ['user_uuid'],
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', user.uuid)
      ])
    });
    
    // Если пользователь не является участником, проверяем, является ли он создателем
    if (!workoutParticipant) {
      const [workout] = await databaseProvider.select(knex, {
        table: 'workouts',
        schema: SCHEMA,
        columns: ['created_by'],
        where: eq('workout_uuid', id)
      });
      
      if (!workout || workout.created_by !== user.uuid) {
        return reply.status(403).send({ error: 'Вы не являетесь участником тренировки' });
      }
    }
    
    // Создаем запись о начале тренировки
    const [workoutProgress] = await databaseProvider.insert(knex, {
      table: 'workout_progress',
      schema: SCHEMA,
      values: [{
        workout_uuid: id,
        user_uuid: user.uuid,
        started_at: new Date().toISOString(),
        completed_sets: '[]' // Пустой JSON массив
      }]
    });
    
    console.log(`[POST /workouts/:id/start] Тренировка начата: id=${id}, user=${user.uuid}`);
    
    return { 
      message: 'Тренировка начата',
      workoutProgress
    };
  });
  
  // Отметка выполнения подхода
  fastify.post('/workouts/:id/sets/:setId/complete', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id, setId } = request.params as any;
    console.log(`[POST /workouts/:id/sets/:setId/complete] Отметка подхода: workoutId=${id}, setId=${setId}, user=${user.uuid}`);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    // Находим запись о прогрессе тренировки
    const [progress] = await databaseProvider.select(knex, {
      table: 'workout_progress',
      schema: SCHEMA,
      columns: ['progress_id', 'completed_sets'],
      where: and([
        eq('workout_uuid', id),
        eq('user_uuid', user.uuid),
        eq('finished_at', null)
      ])
    });
    
    if (!progress) {
      return reply.status(404).send({ error: 'Активная тренировка не найдена' });
    }
    
    // Обновляем список выполненных подходов
    let completedSets = JSON.parse(progress.completed_sets || '[]');
    completedSets.push(setId);
    
    await databaseProvider.update(knex, {
      table: 'workout_progress',
      schema: SCHEMA,
      values: {
        completed_sets: JSON.stringify(completedSets)
      },
      where: eq('progress_id', progress.progress_id)
    });
    
    // Находим индексы упражнения и подхода для ответа клиенту
    // В реальном проекте здесь нужна более сложная логика для поиска правильных индексов
    // Здесь мы упрощаем для демонстрации
    const exerciseIndex = 0; // Заглушка
    const setIndex = 0; // Заглушка
    
    return {
      message: 'Подход отмечен как выполненный',
      exerciseIndex,
      setIndex,
      setId
    };
  });
  
  // Завершение тренировки
  fastify.post('/workouts/:id/finish', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
    console.log(`[POST /workouts/:id/finish] Завершение тренировки: id=${id}, user=${user.uuid}`);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    // Проверяем, имеет ли пользователь права на тренировку
    const [workout] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['workout_uuid', 'created_by'],
      where: eq('workout_uuid', id)
    });
    
    if (!workout) {
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }

    const now = new Date().toISOString();
    
    try {
      // Ищем запись о прогрессе тренировки, но не требуем её обязательного наличия
      const [progress] = await databaseProvider.select(knex, {
        table: 'workout_progress',
        schema: SCHEMA,
        columns: ['progress_id'],
        where: and([
          eq('workout_uuid', id),
          eq('user_uuid', user.uuid),
          eq('finished_at', null)
        ])
      });
      
      // Если запись о прогрессе существует, обновляем её
      if (progress) {
        console.log(`[POST /workouts/:id/finish] Найдена запись о прогрессе: ${progress.progress_id}`);
        await databaseProvider.update(knex, {
          table: 'workout_progress',
          schema: SCHEMA,
          values: {
            finished_at: now
          },
          where: eq('progress_id', progress.progress_id)
        });
      } else {
        console.log(`[POST /workouts/:id/finish] Запись о прогрессе не найдена, создаем новую`);
        // Если записи нет, создаем новую запись с уже завершенным статусом
        await databaseProvider.insert(knex, {
          table: 'workout_progress',
          schema: SCHEMA,
          values: [{
            workout_uuid: id,
            user_uuid: user.uuid,
            started_at: now,
            finished_at: now,
            completed_sets: '[]' // Пустой JSON массив
          }]
        });
      }
      
      // Если пользователь является создателем, помечаем саму тренировку как завершенную
      if (workout.created_by === user.uuid) {
        console.log(`[POST /workouts/:id/finish] Пользователь является создателем, отмечаем тренировку как завершенную`);
        await databaseProvider.update(knex, {
          table: 'workouts',
          schema: SCHEMA,
          values: {
            is_completed: true,
            completed_at: now
          },
          where: eq('workout_uuid', id)
        });
      }
      
      console.log(`[POST /workouts/:id/finish] Тренировка завершена: id=${id}, user=${user.uuid}`);
      
      return {
        message: 'Тренировка завершена',
        completed_at: now
      };
    } catch (error) {
      console.error('[POST /workouts/:id/finish] Ошибка при завершении тренировки:', error);
      return reply.status(500).send({ 
        error: 'Ошибка при завершении тренировки',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Добавление упражнения к тренировке
  fastify.post('/workouts/:id/exercises', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
    const { exercise_id, name, muscle_group, sets, reps, rest_seconds } = request.body as any;
    
    console.log(`[POST /workouts/:id/exercises] Добавление упражнения: id=${id}, user=${user.uuid}`);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    // Проверяем права на редактирование тренировки (должен быть создателем)
    const [workoutInfo] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by'],
      where: eq('workout_uuid', id)
    });
    
    if (!workoutInfo) {
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }
    
    if (workoutInfo.created_by !== user.uuid) {
      return reply.status(403).send({ error: 'Нет прав на редактирование тренировки' });
    }
    
    try {
      // Начинаем транзакцию
      return await knex.transaction(async (trx) => {
        let actualExerciseId = exercise_id;
        
        // Если не передан exercise_id, но передано name, ищем или создаем упражнение
        if (!actualExerciseId && name) {
          // Ищем существующее упражнение по имени
          const [existingExercise] = await databaseProvider.select(trx, {
            table: 'exercises',
            schema: SCHEMA,
            columns: ['exercise_id'],
            where: eq('name', name)
          });
          
          if (existingExercise) {
            actualExerciseId = existingExercise.exercise_id;
          } else {
            // Создаем новое упражнение
            const [newExercise] = await databaseProvider.insert(trx, {
              table: 'exercises',
              schema: SCHEMA,
              values: [{
                name,
                muscle_group
              }]
            });
            actualExerciseId = newExercise.exercise_id;
          }
        }
        
        if (!actualExerciseId) {
          return reply.status(400).send({ error: 'Требуется ID упражнения или его название' });
        }
        
        // Находим максимальный порядок сортировки для добавления нового упражнения в конец
        const [maxOrderResult] = await databaseProvider.query(
          `SELECT MAX(sort_order) as max_order FROM ${SCHEMA}.workout_sets WHERE workout_uuid = $1`,
          [id]
        );
        
        const currentMaxOrder = maxOrderResult.max_order || 0;
        const setsCount = sets || 3; // Количество подходов
        
        // Создаем массив подходов для нового упражнения
        const workoutSets = [];
        for (let i = 0; i < setsCount; i++) {
          workoutSets.push({
            workout_uuid: id,
            exercise_id: actualExerciseId,
            reps: reps || 10,
            weight: 0, // Начальный вес
            rest_seconds: rest_seconds || 60,
            sort_order: currentMaxOrder + 1 + i,
            set_number: i + 1,
            is_completed: false
          });
        }
        
        // Добавляем подходы в БД
        await databaseProvider.insert(trx, {
          table: 'workout_sets',
          schema: SCHEMA,
          values: workoutSets
        });
        
        // Добавляем обновленные данные о тренировке
        const workoutDetails = await getWorkoutDetails(databaseProvider, trx, id, user.uuid);
        
        console.log(`[POST /workouts/:id/exercises] Упражнение добавлено: id=${id}, exercise=${actualExerciseId}`);
        
                            return {            message: 'Упражнение добавлено',            exercise: workoutDetails.exercises.find((e: Exercise) => e.id === String(actualExerciseId))          };
      });
    } catch (error) {
      console.error('[POST /workouts/:id/exercises] Ошибка при добавлении упражнения:', error);
      return reply.status(500).send({ 
        error: 'Ошибка при добавлении упражнения',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Удаление упражнения из тренировки
  fastify.delete('/workouts/:id/exercises/:exerciseId', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id, exerciseId } = request.params as any;
    
    console.log(`[DELETE /workouts/:id/exercises/:exerciseId] Удаление упражнения: id=${id}, exerciseId=${exerciseId}, user=${user.uuid}`);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    // Проверяем права на редактирование тренировки
    const [workoutInfo] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by'],
      where: eq('workout_uuid', id)
    });
    
    if (!workoutInfo) {
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }
    
    // Только создатель может удалять упражнения
    if (workoutInfo.created_by !== user.uuid) {
      return reply.status(403).send({ error: 'Нет прав на редактирование тренировки' });
    }
    
    try {
      // Выполняем удаление в рамках транзакции
      return await knex.transaction(async (trx) => {
        // Находим все подходы для этого упражнения, чтобы знать их порядковые номера
        const deletedSets = await databaseProvider.select(trx, {
          table: 'workout_sets',
          schema: SCHEMA,
          columns: ['sort_order'],
          where: and([
            eq('workout_uuid', id),
            eq('exercise_id', exerciseId)
          ]),
          orderBy: [{ column: 'sort_order', direction: 'asc' }]
        });
        
        if (deletedSets.length === 0) {
          return reply.status(404).send({ error: 'Упражнение не найдено в тренировке' });
        }
        
        // Удаляем все подходы для этого упражнения
        await databaseProvider.delete(trx, {
          table: 'workout_sets',
          schema: SCHEMA,
          where: and([
            eq('workout_uuid', id),
            eq('exercise_id', exerciseId)
          ])
        });
        
        // Обновляем порядок сортировки для подходов, которые шли после удаленных
        // Находим минимальный порядок среди удаленных подходов
        const minDeletedOrder = Math.min(...deletedSets.map((set: any) => set.sort_order));
        
        // Обновляем порядок для подходов, которые шли после удаленных
        await databaseProvider.query(
          `UPDATE ${SCHEMA}.workout_sets 
           SET sort_order = sort_order - ${deletedSets.length} 
           WHERE workout_uuid = $1 AND sort_order > $2`,
          [id, minDeletedOrder - 1]
        );
        
        console.log(`[DELETE /workouts/:id/exercises/:exerciseId] Упражнение удалено: id=${id}, exerciseId=${exerciseId}`);
        
        // Получаем обновленные данные о тренировке
        const workoutDetails = await getWorkoutDetails(databaseProvider, trx, id, user.uuid);
        
        return { 
          message: 'Упражнение удалено',
          exercises: workoutDetails.exercises
        };
      });
    } catch (error) {
      console.error('[DELETE /workouts/:id/exercises/:exerciseId] Ошибка при удалении упражнения:', error);
      return reply.status(500).send({ 
        error: 'Ошибка при удалении упражнения',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Добавление подхода к упражнению
  fastify.post('/workouts/:id/exercises/:exerciseId/sets', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id, exerciseId } = request.params as any;
    const { reps, weight, rest_seconds } = request.body as any;
    
    console.log(`[POST /workouts/:id/exercises/:exerciseId/sets] Добавление подхода: id=${id}, exerciseId=${exerciseId}, user=${user.uuid}`);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    // Проверяем права на редактирование тренировки
    const [workoutInfo] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by'],
      where: eq('workout_uuid', id)
    });
    
    if (!workoutInfo) {
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }
    
    // Только создатель может добавлять подходы
    if (workoutInfo.created_by !== user.uuid) {
      return reply.status(403).send({ error: 'Нет прав на редактирование тренировки' });
    }
    
    try {
      // Начинаем транзакцию
      return await knex.transaction(async (trx) => {
        // Проверяем существование упражнения в тренировке
        const existingSets = await databaseProvider.select(trx, {
          table: 'workout_sets',
          schema: SCHEMA,
          columns: ['set_uuid', 'set_number', 'sort_order'],
          where: and([
            eq('workout_uuid', id),
            eq('exercise_id', exerciseId)
          ]),
          orderBy: [{ column: 'set_number', direction: 'desc' }]
        });
        
        if (existingSets.length === 0) {
          return reply.status(404).send({ error: 'Упражнение не найдено в тренировке' });
        }
        
        // Находим максимальный номер подхода и порядок сортировки
        const maxSetNumber = existingSets[0].set_number;
        
        // Находим максимальный порядок сортировки для этого упражнения
        let maxSortOrder = 0;
        for (const set of existingSets) {
          if (set.sort_order > maxSortOrder) {
            maxSortOrder = set.sort_order;
          }
        }
        
                // Применяем двухэтапный подход для избежания нарушения ограничения уникальности        // 1. Сначала смещаем все подходы на большие временные значения        await trx.raw(          `UPDATE ${SCHEMA}.workout_sets            SET sort_order = sort_order + 1000           WHERE workout_uuid = ? AND sort_order > ?`,          [id, maxSortOrder]        );                // 2. Добавляем новый подход        const [newSet] = await databaseProvider.insert(trx, {          table: 'workout_sets',          schema: SCHEMA,          values: [{            workout_uuid: id,            exercise_id: exerciseId,            set_number: maxSetNumber + 1,            reps: reps || 10,            weight: weight || 0,            rest_seconds: rest_seconds || 60,            sort_order: maxSortOrder + 1,            is_completed: false          }]        });                // 3. Теперь возвращаем смещенные на правильные значения        await trx.raw(          `UPDATE ${SCHEMA}.workout_sets            SET sort_order = sort_order - 999           WHERE workout_uuid = ? AND sort_order > ?`,          [id, maxSortOrder + 1]        );
        
        console.log(`[POST /workouts/:id/exercises/:exerciseId/sets] Подход добавлен: id=${id}, exerciseId=${exerciseId}`);
        
        // Получаем обновленные данные о тренировке         const workoutDetails = await getWorkoutDetails(databaseProvider, trx, id, user.uuid);         const updatedExercise = workoutDetails.exercises.find((e: Exercise) => e.id === String(exerciseId));                  return {           message: 'Подход добавлен',           set: newSet,           exercise: updatedExercise         };
      });
    } catch (error) {
      console.error('[POST /workouts/:id/exercises/:exerciseId/sets] Ошибка при добавлении подхода:', error);
      return reply.status(500).send({ 
        error: 'Ошибка при добавлении подхода',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Удаление подхода
  fastify.delete('/workouts/:id/sets/:setId', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id, setId } = request.params as any;
    
    console.log(`[DELETE /workouts/:id/sets/:setId] Удаление подхода: id=${id}, setId=${setId}, user=${user.uuid}`);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    // Проверяем права на редактирование тренировки
    const [workoutInfo] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by'],
      where: eq('workout_uuid', id)
    });
    
    if (!workoutInfo) {
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }
    
    // Только создатель может удалять подходы
    if (workoutInfo.created_by !== user.uuid) {
      return reply.status(403).send({ error: 'Нет прав на редактирование тренировки' });
    }
    
    try {
      // Начинаем транзакцию
      return await knex.transaction(async (trx) => {
        // Получаем информацию о подходе
        const [set] = await databaseProvider.select(trx, {
          table: 'workout_sets',
          schema: SCHEMA,
          columns: ['set_uuid', 'exercise_id', 'set_number', 'sort_order'],
          where: and([
            eq('workout_uuid', id),
            eq('set_uuid', setId)
          ])
        });
        
        if (!set) {
          return reply.status(404).send({ error: 'Подход не найден' });
        }
        
        const exerciseId = set.exercise_id;
        const sortOrder = set.sort_order;
        const setNumber = set.set_number;
        
        // Удаляем подход
        await databaseProvider.delete(trx, {
          table: 'workout_sets',
          schema: SCHEMA,
          where: and([
            eq('workout_uuid', id),
            eq('set_uuid', setId)
          ])
        });
        
        // Обновляем номера подходов в рамках упражнения
        await databaseProvider.query(
          `UPDATE ${SCHEMA}.workout_sets 
           SET set_number = set_number - 1
           WHERE workout_uuid = $1 AND exercise_id = $2 AND set_number > $3`,
          [id, exerciseId, setNumber]
        );
        
        // Обновляем порядок сортировки для всех подходов после удаленного
        await databaseProvider.query(
          `UPDATE ${SCHEMA}.workout_sets 
           SET sort_order = sort_order - 1
           WHERE workout_uuid = $1 AND sort_order > $2`,
          [id, sortOrder]
        );
        
        console.log(`[DELETE /workouts/:id/sets/:setId] Подход удален: id=${id}, setId=${setId}`);
        
        // Получаем обновленные данные о тренировке
        const workoutDetails = await getWorkoutDetails(databaseProvider, trx, id, user.uuid);
        const updatedExercise = workoutDetails.exercises.find((e: Exercise) => e.id === String(exerciseId));
        
        return { 
          message: 'Подход удален',
          exercise: updatedExercise
        };
      });
    } catch (error) {
      console.error('[DELETE /workouts/:id/sets/:setId] Ошибка при удалении подхода:', error);
      return reply.status(500).send({ 
        error: 'Ошибка при удалении подхода',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Выход из чужой тренировки
  fastify.post('/workouts/:id/leave', { preHandler: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Не авторизован' });
    }

    const { id } = request.params as any;
    
    console.log(`[POST /workouts/:id/leave] Выход из тренировки: id=${id}, user=${user.uuid}`);
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    // Проверяем, не является ли пользователь создателем (создатель не может выйти)
    const [workoutInfo] = await databaseProvider.select(knex, {
      table: 'workouts',
      schema: SCHEMA,
      columns: ['created_by', 'title'],
      where: eq('workout_uuid', id)
    });
    
    if (!workoutInfo) {
      return reply.status(404).send({ error: 'Тренировка не найдена' });
    }
    
    if (workoutInfo.created_by === user.uuid) {
      return reply.status(400).send({ error: 'Создатель не может выйти из тренировки' });
    }
    
    try {
      // Проверяем, является ли пользователь участником
      const [participant] = await databaseProvider.select(knex, {
        table: 'workout_participants',
        schema: SCHEMA,
        columns: ['user_uuid'],
        where: and([
          eq('workout_uuid', id),
          eq('user_uuid', user.uuid)
        ])
      });
      
      if (!participant) {
        return reply.status(400).send({ error: 'Вы не являетесь участником этой тренировки' });
      }
      
      // Удаляем пользователя из участников
      await databaseProvider.delete(knex, {
        table: 'workout_participants',
        schema: SCHEMA,
        where: and([
          eq('workout_uuid', id),
          eq('user_uuid', user.uuid)
        ])
      });
      
      console.log(`[POST /workouts/:id/leave] Пользователь вышел из тренировки: id=${id}, user=${user.uuid}`);
      
      // Отправляем уведомление создателю тренировки
      if (fastify.notificationService) {
        try {
          // Получаем информацию о пользователе
          const [userInfo] = await databaseProvider.select(knex, {
            table: 'users',
            schema: SCHEMA,
            columns: ['display_name', 'username'],
            where: eq('user_uuid', user.uuid)
          });
          
          if (userInfo) {
            const userName = userInfo.display_name || userInfo.username;
            fastify.notificationService.notifyUser(
              workoutInfo.created_by,
              `${userName} вышел из тренировки "${workoutInfo.title}"`,
              'Участник покинул тренировку',
              'info',
              id
            );
            
            console.log(`[POST /workouts/:id/leave] Отправлено уведомление создателю ${workoutInfo.created_by}`);
          }
        } catch (error) {
          console.error('[POST /workouts/:id/leave] Ошибка при отправке уведомления:', error);
        }
      } else {
        console.warn('[POST /workouts/:id/leave] notificationService не найден');
      }
      
      return { 
        message: 'Вы успешно вышли из тренировки'
      };
    } catch (error) {
      console.error('[POST /workouts/:id/leave] Ошибка при выходе из тренировки:', error);
      return reply.status(500).send({ 
        error: 'Ошибка при выходе из тренировки',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
};

export default workoutPlugin; 
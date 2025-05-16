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
          
          return {
            id: details.workout_uuid,
            name: details.title,
            date: details.scheduled_time,
            notes: details.description,
            role: details.role,
            exercises: details.exercises,
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
      console.log('Отказано в доступе: пользователь не является создателем');
      return reply.status(403).send({ error: 'Нет прав на редактирование' });
    }
    
    console.log('Проверка прав успешна, продолжаем обработку');

    // Получаем все детали тренировки с упражнениями через общую функцию
    const workoutDetails = await getWorkoutDetails(databaseProvider, knex, id, user.uuid);
    
    // Форматируем ответ для клиента в нужном формате
    const response = {
      id: workoutDetails.workout_uuid,
      name: workoutDetails.title,
      date: workoutDetails.scheduled_time,
      notes: workoutDetails.description,
      is_completed: workoutDetails.is_completed,
      completed_at: workoutDetails.completed_at,
      exercises: workoutDetails.exercises || [],
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
    
    // Возвращаем полную информацию о тренировке в формате, совместимом с клиентом
    const workoutDetails = await getWorkoutDetails(databaseProvider, knex, workout.workout_uuid, user.uuid);
    
    return { 
      id: workoutDetails.workout_uuid,
      name: workoutDetails.title,
      date: workoutDetails.scheduled_time,
      notes: workoutDetails.description,
      is_completed: workoutDetails.is_completed,
      completed_at: workoutDetails.completed_at,
      exercises: workoutDetails.exercises || [],
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
    
    // Получаем упражнения
    console.log('[getWorkoutDetails] Запрашиваем упражнения для тренировки...');
    const exercises = await databaseProvider.select(knex, {
      table: 'workout_exercises',
      schema: SCHEMA,
      columns: [
        'workout_exercises.*', 
        'exercises.name', 
        'exercises.muscle_group', 
        'exercises.description as exercise_description'
      ],
      joins: [{
        type: 'inner',
        table: 'exercises',
        on: ['workout_exercises.exercise_id', '=', 'exercises.exercise_id']
      }],
      where: eq('workout_uuid', workoutId),
      orderBy: [{ column: 'sort_order', direction: 'asc' }]
    });
    
    console.log('[getWorkoutDetails] Полученные упражнения:', exercises);
    
    // Преобразуем упражнения в правильный формат
    const formattedExercises = exercises.map((ex: any) => {
      // Преобразуем sets из числа или JSON-строки в массив объектов
      let sets;
      
      if (typeof ex.sets === 'number' || (typeof ex.sets === 'string' && !isNaN(Number(ex.sets)))) {
        // Если sets - число или строка с числом, создаем массив подходов
        const setsCount = typeof ex.sets === 'number' ? ex.sets : parseInt(ex.sets);
        console.log(`[getWorkoutDetails] Упражнение ${ex.name}: sets=${setsCount} (число)`);
        
        sets = Array.from({ length: setsCount }, (_, i) => ({
          id: `set-${ex.exercise_id}-${i}`,
          reps: ex.reps || 10,
          weight: 0,
          isCompleted: false
        }));
      } else if (typeof ex.sets === 'string') {
        try {
          // Пробуем распарсить JSON
          console.log(`[getWorkoutDetails] Пробуем распарсить sets как JSON: ${ex.sets}`);
          sets = JSON.parse(ex.sets);
          
          // Убедимся, что каждый подход имеет id
          sets = sets.map((set: any, i: number) => ({
            id: set.id || `set-${ex.exercise_id}-${i}`,
            reps: set.reps || ex.reps || 10,
            weight: set.weight || 0,
            isCompleted: !!set.isCompleted,
            notes: set.notes || ''
          }));
        } catch (e) {
          console.error('[getWorkoutDetails] Ошибка при парсинге sets:', e);
          // В случае ошибки создаем один подход по умолчанию
          sets = [{
            id: `set-${ex.exercise_id}-0`,
            reps: ex.reps || 10,
            weight: 0,
            isCompleted: false
          }];
        }
      } else {
        console.log(`[getWorkoutDetails] Упражнение ${ex.name}: sets не определены, создаем пустой массив`);
        // Если sets нет, создаем пустой массив
        sets = [];
      }
      
      console.log(`[getWorkoutDetails] Упражнение ${ex.name} (${ex.exercise_id}), sets:`, sets);
      
      return {
        id: String(ex.exercise_id),
        name: ex.name,
        sets: sets,
        rest_seconds: ex.rest_seconds,
        notes: ex.exercise_description
      };
    });
    
    console.log('[getWorkoutDetails] Форматированные упражнения:', formattedExercises);
    
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
    if ((fastify as any).notificationService) {
      for (const p of participants) {
        if (p.user_uuid !== user.uuid) {
          (fastify as any).notificationService.notifyUser(p.user_uuid, `Тренировка завершена!`);
        }
      }
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
            table: 'workout_exercises',
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
            table: 'workout_exercises',
            schema: SCHEMA,
            where: eq('workout_uuid', id)
          });
          
          console.log('PUT: Добавляем упражнения:', exercisesToInsert);
          
          if (exercisesToInsert.length > 0) {
            await databaseProvider.insert(trx, {
              table: 'workout_exercises',
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
        table: 'workout_exercises',
        schema: SCHEMA,
        columns: [
          'workout_exercises.*', 
          'exercises.name', 
          'exercises.muscle_group', 
          'exercises.description as exercise_description'
        ],
        joins: [{
          type: 'inner',
          table: 'exercises',
          on: ['workout_exercises.exercise_id', '=', 'exercises.exercise_id']
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
};

export default workoutPlugin; 
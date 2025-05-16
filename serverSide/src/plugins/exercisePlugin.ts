import { FastifyPluginAsync } from 'fastify';
import { eq } from '../db/queryBuilders/filters';
import { DatabaseService } from '../db/services/databaseService';
const SCHEMA = 'workout_app';

const exercisePlugin: FastifyPluginAsync = async (fastify) => {
  // Получение всех упражнений
  fastify.get('/api/exercises', async (req, reply) => {
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();

    const exercises = await databaseProvider.select(knex, {
      table: 'exercises',
      schema: SCHEMA,
      columns: ['*'],
      orderBy: [{ column: 'name', direction: 'asc' }]
    });
    return { exercises };
  });

  // Создание нового упражнения
  fastify.post('/api/exercises', async (req, reply) => {
    console.log('[POST /exercises] Запрос на создание упражнения:', req.body);
    
    const { name, muscle_group, description } = req.body as any;
    
    if (!name) {
      console.log('[POST /exercises] Ошибка: имя упражнения не указано');
      return reply.status(400).send({ error: 'Имя упражнения обязательно' });
    }
    
    const databaseClient = DatabaseService.getClient('main');
    const databaseProvider = databaseClient.getProvider();
    const knex = databaseClient.getKnex();
    
    try {
      // Проверяем, существует ли уже упражнение с таким именем
      console.log(`[POST /exercises] Проверяем существование упражнения "${name}"`);
      const [existingExercise] = await databaseProvider.select(knex, {
        table: 'exercises',
        schema: SCHEMA,
        columns: ['exercise_id'],
        where: eq('name', name)
      });
      
      if (existingExercise) {
        console.log(`[POST /exercises] Упражнение "${name}" уже существует, ID=${existingExercise.exercise_id}`);
        // Если упражнение уже существует, возвращаем его
        return { 
          id: existingExercise.exercise_id,
          name,
          muscle_group: muscle_group || null,
          description: description || null
        };
      }
      
      // Создаем новое упражнение
      console.log(`[POST /exercises] Создаем новое упражнение "${name}"`);
      const [newExercise] = await databaseProvider.insert(knex, {
        table: 'exercises',
        schema: SCHEMA,
        values: [{
          name,
          muscle_group: muscle_group || null,
          description: description || null
        }]
      });
      
      console.log(`[POST /exercises] Упражнение создано, ID=${newExercise.exercise_id}`);
      
      // Возвращаем созданное упражнение
      return { 
        id: newExercise.exercise_id,
        name: newExercise.name,
        muscle_group: newExercise.muscle_group,
        description: newExercise.description
      };
    } catch (error) {
      console.error('[POST /exercises] Ошибка при создании упражнения:', error);
      return reply.status(500).send({ error: 'Ошибка при создании упражнения' });
    }
  });
};

export default exercisePlugin; 
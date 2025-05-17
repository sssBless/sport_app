export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

// Подход для конкретного упражнения
export interface ExerciseSet {
  id: string; // Уникальный идентификатор подхода
  exercise_id: number; // ID упражнения
  reps: number; // Количество повторений
  weight: number; // Дополнительный вес в кг
  rest_seconds?: number; // Время отдыха после подхода
  is_completed: boolean; // Выполнен ли подход
  set_number: number; // Номер подхода
  notes?: string; // Заметки к подходу
}

// Упражнение с подходами (для отображения)
export interface ExerciseGrouped {
  id: string; // ID упражнения в строковом формате
  name: string; // Название упражнения
  muscle_group?: string; // Целевая мышечная группа
  sets: ExerciseSet[]; // Набор подходов
}

// Основной интерфейс для тренировки
export interface Workout {
  id: string;
  name: string;
  description: string;
  exercises: ExerciseGrouped[]; // Упражнения с их подходами
  participants: User[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  is_completed: boolean;
  completed_at?: string;
  is_creator?: boolean; // Флаг: является ли текущий пользователь создателем
}

export interface WorkoutProgress {
  workoutId: string;
  userId: string;
  completedSets: string[]; // массив ID выполненных подходов
  startedAt: string;
  finishedAt?: string;
}

export interface WorkoutStatistics {
  totalWorkouts: number;
  totalExercises: number;
  totalTime: number;
  workoutHistory: {
    date: string;
    workouts: number;
  }[];
  mostPopularExercises: {
    name: string;
    count: number;
  }[];
} 
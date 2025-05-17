export interface WorkoutSet {
  set_uuid: string;
  workout_uuid: string;
  exercise_id: number;
  reps: number;
  weight: number;
  rest_seconds?: number;
  sort_order: number;
  set_number: number;
  notes?: string;
  is_completed: boolean;
  exercise_name?: string; // Будет заполнено при объединении с данными упражнений
  exercise_muscle_group?: string;
}

export interface Exercise {
  exercise_id: number;
  name: string;
  muscle_group?: string;
  description?: string;
}

export interface Workout {
  workout_uuid: string;
  title: string;
  description?: string;
  created_by: string;
  scheduled_time: Date;
  created_at: Date;
  is_completed: boolean;
  completed_at?: Date;
  sets?: WorkoutSet[]; // Новое поле для подходов
}

// Для API ответов
export interface WorkoutResponse {
  id: string;
  name: string;
  description: string;
  date: string; // scheduled_time в ISO формате
  is_completed: boolean;
  completed_at?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  exercises: ExerciseGrouped[];
  participants: any[];
}

// Группировка подходов по упражнениям для отображения на клиенте
export interface ExerciseGrouped {
  id: string;
  name: string;
  muscle_group?: string;
  sets: ExerciseSet[];
}

export interface ExerciseSet {
  id: string;
  exercise_id: number;
  reps: number;
  weight: number;
  rest_seconds?: number;
  is_completed: boolean;
  set_number: number;
  notes?: string;
} 
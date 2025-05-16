import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Workout {
  id: string;
  name: string;
  date: string;
  duration?: number;
  exercises: Exercise[];
  notes?: string;
  is_completed?: boolean;
  completed_at?: string;
  is_creator?: boolean;
}

export interface ExerciseSet {
  id: string;
  reps: number;
  weight?: number;
  isCompleted?: boolean;
  notes?: string;
}

export interface Exercise {
  id: string;
  name: string;
  sets: ExerciseSet[];
  duration?: number;
  notes?: string;
}

interface WorkoutsState {
  items: Workout[];
  loading: boolean;
  error: string | null;
  currentWorkout: Workout | null;
}

const initialState: WorkoutsState = {
  items: [],
  loading: false,
  error: null,
  currentWorkout: null
};

const workoutsSlice = createSlice({
  name: 'workouts',
  initialState,
  reducers: {
    setWorkouts: (state, action: PayloadAction<Workout[]>) => {
      state.items = action.payload;
      state.loading = false;
      state.error = null;
    },
    addWorkout: (state, action: PayloadAction<Workout>) => {
      state.items.push(action.payload);
    },
    updateWorkout: (state, action: PayloadAction<Workout>) => {
      const index = state.items.findIndex(w => w.id === action.payload.id);
      if (index !== -1) {
        state.items[index] = action.payload;
      }
    },
    deleteWorkout: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(w => w.id !== action.payload);
    },
    setCurrentWorkout: (state, action: PayloadAction<Workout | null>) => {
      state.currentWorkout = action.payload;
    },
    updateExerciseSet: (state, action: PayloadAction<{
      workoutId: string, 
      exerciseId: string, 
      setId: string, 
      updatedSet: Partial<ExerciseSet>
    }>) => {
      const { workoutId, exerciseId, setId, updatedSet } = action.payload;
      const workoutIndex = state.items.findIndex(w => w.id === workoutId);
      
      if (workoutIndex !== -1) {
        const workout = state.items[workoutIndex];
        const exerciseIndex = workout.exercises.findIndex(e => e.id === exerciseId);
        
        if (exerciseIndex !== -1) {
          const exercise = workout.exercises[exerciseIndex];
          const setIndex = exercise.sets.findIndex(s => s.id === setId);
          
          if (setIndex !== -1) {
            exercise.sets[setIndex] = { 
              ...exercise.sets[setIndex], 
              ...updatedSet 
            };
          }
        }
      }
      
      // Также обновляем текущую тренировку, если это она
      if (state.currentWorkout && state.currentWorkout.id === workoutId) {
        const exerciseIndex = state.currentWorkout.exercises.findIndex(e => e.id === exerciseId);
        
        if (exerciseIndex !== -1) {
          const exercise = state.currentWorkout.exercises[exerciseIndex];
          const setIndex = exercise.sets.findIndex(s => s.id === setId);
          
          if (setIndex !== -1) {
            exercise.sets[setIndex] = { 
              ...exercise.sets[setIndex], 
              ...updatedSet 
            };
          }
        }
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    }
  }
});

export const {
  setWorkouts,
  addWorkout,
  updateWorkout,
  deleteWorkout,
  setCurrentWorkout,
  updateExerciseSet,
  setLoading,
  setError
} = workoutsSlice.actions;

export default workoutsSlice.reducer; 
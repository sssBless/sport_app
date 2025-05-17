import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiInstance } from '../../api/axios';
import { Workout, ExerciseGrouped, WorkoutStatistics, User } from '../../types';

interface WorkoutState {
  workouts: Workout[];
  currentWorkout: Workout | null;
  statistics: WorkoutStatistics | null;
  loading: boolean;
  error: string | null;
  workoutInProgress: boolean;
}

const initialState: WorkoutState = {
  workouts: [],
  currentWorkout: null,
  statistics: null,
  loading: false,
  error: null,
  workoutInProgress: false,
};

export const fetchWorkouts = createAsyncThunk('workout/fetchAll', async () => {
  const response = await apiInstance.get('/workouts');
  return response.data.workouts || [];
});

export const fetchWorkoutById = createAsyncThunk(
  'workout/fetchById',
  async (id: string) => {
    const response = await apiInstance.get(`/workouts/${id}`);
    return response.data;
  }
);

export const createWorkout = createAsyncThunk(
  'workout/create',
  async (data: { name: string; description: string }) => {
    const response = await apiInstance.post('/workouts', data);
    return response.data;
  }
);

export const updateExerciseOrder = createAsyncThunk(
  'workout/updateExerciseOrder',
  async (data: { workoutId: string; exercises: ExerciseGrouped[] }) => {
    const response = await apiInstance.put(`/workouts/${data.workoutId}/exercises/order`, {
      exercises: data.exercises,
    });
    return response.data;
  }
);

export const fetchWorkoutParticipants = createAsyncThunk(
  'workout/fetchParticipants',
  async (workoutId: string) => {
    const response = await apiInstance.get(`/workouts/${workoutId}/participants`);
    return { workoutId, participants: response.data.participants || [] };
  }
);

export const inviteParticipant = createAsyncThunk(
  'workout/inviteParticipant',
  async (data: { workoutId: string; email: string }) => {
    const response = await apiInstance.post(`/invitations`, {
      workout_uuid: data.workoutId,
      email: data.email
    });
    return response.data;
  }
);

export const startWorkout = createAsyncThunk(
  'workout/startWorkout',
  async (workoutId: string) => {
    const response = await apiInstance.post(`/workouts/${workoutId}/start`);
    return response.data;
  }
);

export const completeSet = createAsyncThunk(
  'workout/completeSet',
  async (data: { workoutId: string; setId: string }) => {
    const response = await apiInstance.post(`/workouts/${data.workoutId}/sets/${data.setId}/complete`);
    return response.data;
  }
);

export const finishWorkout = createAsyncThunk(
  'workout/finishWorkout',
  async (workoutId: string) => {
    const response = await apiInstance.post(`/workouts/${workoutId}/finish`);
    return response.data;
  }
);

export const addExerciseToWorkout = createAsyncThunk(
  'workout/addExercise',
  async (data: { workoutId: string; exerciseId?: number; name?: string; muscleGroup?: string; sets?: number; reps?: number; restSeconds?: number }) => {
    const response = await apiInstance.post(`/workouts/${data.workoutId}/exercises`, {
      exercise_id: data.exerciseId,
      name: data.name,
      muscle_group: data.muscleGroup,
      sets: data.sets || 3,
      reps: data.reps || 10,
      rest_seconds: data.restSeconds || 60
    });
    return response.data;
  }
);

export const removeExerciseFromWorkout = createAsyncThunk(
  'workout/removeExercise',
  async (data: { workoutId: string; exerciseId: string }) => {
    const response = await apiInstance.delete(`/workouts/${data.workoutId}/exercises/${data.exerciseId}`);
    return { ...response.data, exerciseId: data.exerciseId };
  }
);

export const addSetToExercise = createAsyncThunk(
  'workout/addSet',
  async (data: { workoutId: string; exerciseId: string; reps?: number; weight?: number; restSeconds?: number }) => {
    const response = await apiInstance.post(`/workouts/${data.workoutId}/exercises/${data.exerciseId}/sets`, {
      reps: data.reps,
      weight: data.weight,
      rest_seconds: data.restSeconds
    });
    return response.data;
  }
);

export const removeSetFromExercise = createAsyncThunk(
  'workout/removeSet',
  async (data: { workoutId: string; setId: string }) => {
    const response = await apiInstance.delete(`/workouts/${data.workoutId}/sets/${data.setId}`);
    return response.data;
  }
);

export const leaveWorkout = createAsyncThunk(
  'workout/leave',
  async (workoutId: string) => {
    const response = await apiInstance.post(`/workouts/${workoutId}/leave`);
    return { workoutId, ...response.data };
  }
);

const workoutSlice = createSlice({
  name: 'workout',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkouts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWorkouts.fulfilled, (state, action) => {
        state.loading = false;
        state.workouts = action.payload;
      })
      .addCase(fetchWorkouts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Ошибка загрузки тренировок';
      })
      .addCase(fetchWorkoutById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWorkoutById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentWorkout = action.payload;
      })
      .addCase(fetchWorkoutById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Ошибка загрузки тренировки';
      })
      .addCase(createWorkout.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createWorkout.fulfilled, (state, action) => {
        state.loading = false;
        state.workouts.push(action.payload);
      })
      .addCase(createWorkout.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Ошибка создания тренировки';
      })
      .addCase(updateExerciseOrder.fulfilled, (state, action) => {
        if (state.currentWorkout) {
          state.currentWorkout.exercises = action.payload.exercises;
        }
      })
      .addCase(fetchWorkoutParticipants.fulfilled, (state, action) => {
        if (state.currentWorkout && state.currentWorkout.id === action.payload.workoutId) {
          state.currentWorkout.participants = action.payload.participants;
        }
      })
      .addCase(inviteParticipant.pending, (state) => {
        state.loading = true;
      })
      .addCase(inviteParticipant.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(inviteParticipant.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Ошибка при отправке приглашения';
      })
      .addCase(startWorkout.pending, (state) => {
        state.loading = true;
      })
      .addCase(startWorkout.fulfilled, (state) => {
        state.loading = false;
        state.workoutInProgress = true;
      })
      .addCase(startWorkout.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Ошибка при начале тренировки';
      })
      .addCase(completeSet.fulfilled, (state, action) => {
        if (state.currentWorkout) {
          const { exerciseIndex, setIndex } = action.payload;
          state.currentWorkout.exercises[exerciseIndex].sets[setIndex].is_completed = true;
        }
      })
      .addCase(finishWorkout.fulfilled, (state, action) => {
        state.workoutInProgress = false;
        if (state.currentWorkout) {
          state.currentWorkout.is_completed = true;
          state.currentWorkout.completed_at = action.payload.completed_at;
        }
      })
      .addCase(addExerciseToWorkout.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addExerciseToWorkout.fulfilled, (state, action) => {
        state.loading = false;
        if (state.currentWorkout && action.payload.exercise) {
          state.currentWorkout.exercises.push(action.payload.exercise);
        }
      })
      .addCase(addExerciseToWorkout.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Ошибка при добавлении упражнения';
      })
      .addCase(removeExerciseFromWorkout.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(removeExerciseFromWorkout.fulfilled, (state, action) => {
        state.loading = false;
        if (state.currentWorkout) {
          state.currentWorkout.exercises = action.payload.exercises;
        }
      })
      .addCase(removeExerciseFromWorkout.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Ошибка при удалении упражнения';
      })
      .addCase(addSetToExercise.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addSetToExercise.fulfilled, (state, action) => {
        state.loading = false;
        if (state.currentWorkout && action.payload.exercise) {
          const index = state.currentWorkout.exercises.findIndex(
            e => e.id === action.payload.exercise.id
          );
          if (index !== -1) {
            state.currentWorkout.exercises[index] = action.payload.exercise;
          }
        }
      })
      .addCase(addSetToExercise.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Ошибка при добавлении подхода';
      })
      .addCase(removeSetFromExercise.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(removeSetFromExercise.fulfilled, (state, action) => {
        state.loading = false;
        if (state.currentWorkout && action.payload.exercise) {
          const index = state.currentWorkout.exercises.findIndex(
            e => e.id === action.payload.exercise.id
          );
          if (index !== -1) {
            state.currentWorkout.exercises[index] = action.payload.exercise;
          }
        }
      })
      .addCase(removeSetFromExercise.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Ошибка при удалении подхода';
      })
      .addCase(leaveWorkout.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(leaveWorkout.fulfilled, (state, action) => {
        state.loading = false;
        state.workouts = state.workouts.filter(w => w.id !== action.payload.workoutId);
        if (state.currentWorkout && state.currentWorkout.id === action.payload.workoutId) {
          state.currentWorkout = null;
        }
      })
      .addCase(leaveWorkout.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Ошибка при выходе из тренировки';
      });
  },
});

export default workoutSlice.reducer; 
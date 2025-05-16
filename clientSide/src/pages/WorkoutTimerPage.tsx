import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Container,
  Typography,
  Paper,
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  IconButton,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  SkipNext as SkipNextIcon,
  Stop as StopIcon,
  CheckCircle as CheckCircleIcon,
  FitnessCenter as FitnessCenterIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { RootState } from '../app/store';
import Navigation from '../components/Navigation';
import { Exercise, ExerciseSet, Workout, updateWorkout, updateExerciseSet } from '../features/workouts/workoutsSlice';
import api from '../api/axios';

interface FlatSet {
  setId: string;
  exerciseId: string;
  exerciseName: string;
  reps: number;
  weight?: number;
  isCompleted: boolean;
  notes?: string;
}

const WorkoutTimerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const workout = useSelector((state: RootState) =>
    state.workouts.items.find(w => w.id === id)
  );

  const [isResting, setIsResting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSetIndex, setActiveSetIndex] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editReps, setEditReps] = useState(0);

  const REST_TIME = 90; // 90 секунд отдыха

  // --- Плоский массив подходов ---
  const flatSets: FlatSet[] = React.useMemo(() => {
    if (!workout) return [];
    const result: FlatSet[] = [];
    workout.exercises.forEach((exercise, exerciseIdx) => {
      // Гарантируем уникальный id упражнения
      const safeExerciseId = exercise.id || `tmp-ex-${exerciseIdx}-${Math.random().toString(36).slice(2)}`;
      if (!Array.isArray(exercise.sets)) {
        const setsCount = typeof exercise.sets === 'number' ? exercise.sets : 0;
        for (let i = 0; i < setsCount; i++) {
          const setId = `tmp-set-${safeExerciseId}-${i}`;
          result.push({
            setId,
            exerciseId: safeExerciseId,
            exerciseName: exercise.name,
            reps: (exercise as any).reps || 10,
            weight: (exercise as any).weight || 0,
            isCompleted: false,
            notes: ''
          });
        }
      } else {
        exercise.sets.forEach((set, setIdx) => {
          // Гарантируем уникальный id подхода
          const safeSetId = set.id || `tmp-set-${safeExerciseId}-${setIdx}`;
          result.push({
            setId: safeSetId,
            exerciseId: safeExerciseId,
            exerciseName: exercise.name,
            reps: set.reps,
            weight: set.weight,
            isCompleted: !!set.isCompleted,
            notes: set.notes || ''
          });
        });
      }
    });
    return result.filter(s => s.setId && s.exerciseId);
  }, [workout]);

  // --- Логика таймера и выполнения ---
  useEffect(() => {
    if (!workout) {
      navigate('/workouts');
      return;
    }
    // Найти первый невыполненный подход
    const firstUncompleted = flatSets.findIndex(set => !set.isCompleted);
    setActiveSetIndex(firstUncompleted === -1 ? 0 : firstUncompleted);
  }, [workout, flatSets, navigate]);

  useEffect(() => {
    if (!isRunning) return;
    if (timeLeft === 0) {
      if (isResting) {
        setIsResting(false);
        setIsRunning(false);
      }
    }
  }, [timeLeft, isRunning, isResting]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => time - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  const handleStartPause = () => {
    if (!isRunning) {
      if (isResting && timeLeft === 0) {
        setTimeLeft(REST_TIME);
      }
    }
    setIsRunning(!isRunning);
  };

  const handleSkip = () => {
    setTimeLeft(0);
    setIsResting(false);
    setIsRunning(false);
  };

  const handleFinishWorkout = async () => {
    setIsRunning(false);
    if (workout && id) {
      try {
        // Используем PATCH /workouts/:id/complete для сохранения прогресса
        const response = await api.patch(`/workouts/${id}/complete`);
        if (response.data && response.data.workout) {
          dispatch(updateWorkout(response.data.workout));
        }
      } catch (error) {
        console.error('Ошибка при завершении тренировки:', error);
      }
    }
    navigate(`/workout/${id}`);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Выполнение подхода ---
  const completeCurrentSet = async () => {
    if (isResting) return;
    const set = flatSets[activeSetIndex];
    if (!workout || !set || set.isCompleted) return;
    try {
      // Найти упражнение и подход
      const updatedExercises = workout.exercises.map(exercise => {
        if (exercise.id !== set.exerciseId || !Array.isArray(exercise.sets)) return exercise;
        const setIdx = exercise.sets.findIndex(s => s.id === set.setId);
        if (setIdx === -1) return exercise;
        return {
          ...exercise,
          sets: exercise.sets.map((s, idx) => idx === setIdx ? { ...s, isCompleted: true } : s)
        };
      });
      const updatedWorkout = { ...workout, exercises: updatedExercises };
      await api.put(`/workouts/${workout.id}`, updatedWorkout);
      dispatch(updateWorkout(updatedWorkout));
      // Запустить отдых и перейти к следующему подходу
      setIsResting(true);
      setTimeLeft(REST_TIME);
      setIsRunning(true);
      // Перейти к следующему невыполненному подходу
      const nextIdx = flatSets.findIndex((s, idx) => idx > activeSetIndex && !s.isCompleted);
      setActiveSetIndex(nextIdx === -1 ? activeSetIndex : nextIdx);
    } catch (error) {
      console.error('Ошибка при выполнении подхода:', error);
    }
  };

  // --- Прогресс ---
  const totalSets = flatSets.length;
  const completedSets = flatSets.filter(s => s.isCompleted).length;
  const progressPercent = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;
  const currentSet = flatSets[activeSetIndex];
  const restProgress = isResting ? (REST_TIME - timeLeft) / REST_TIME * 100 : 0;
  const allCompleted = flatSets.every(s => s.isCompleted);

  // Функция для редактирования числа повторений
  const handleEditReps = async () => {
    if (!workout || !currentSet) return;
    
    try {
      // Найти упражнение и подход для обновления
      const updatedExercises = workout.exercises.map(exercise => {
        if (exercise.id !== currentSet.exerciseId || !Array.isArray(exercise.sets)) return exercise;
        
        const setIdx = exercise.sets.findIndex(s => s.id === currentSet.setId);
        if (setIdx === -1) return exercise;
        
        return {
          ...exercise,
          sets: exercise.sets.map((s, idx) => 
            idx === setIdx ? { ...s, reps: editReps } : s
          )
        };
      });
      
      const updatedWorkout = { ...workout, exercises: updatedExercises };
      const response = await api.put(`/workouts/${workout.id}`, updatedWorkout);
      dispatch(updateWorkout(response.data));
      setEditDialogOpen(false);
    } catch (error) {
      console.error('Ошибка при обновлении числа повторений:', error);
    }
  };

  const openEditDialog = () => {
    if (currentSet) {
      setEditReps(currentSet.reps);
      setEditDialogOpen(true);
    }
  };

  if (!workout) {
    return null;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navigation />
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h4">
              {workout.name}
            </Typography>
            <Button
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              onClick={handleFinishWorkout}
            >
              Завершить
            </Button>
          </Box>

          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Прогресс тренировки
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {completedSets} / {totalSets} подходов
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={progressPercent} 
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>

          {isResting ? (
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Typography variant="h5" gutterBottom>
                Отдых
              </Typography>
              <Box sx={{ position: 'relative', display: 'inline-flex', my: 4 }}>
                <CircularProgress
                  variant="determinate"
                  value={restProgress}
                  size={200}
                  thickness={4}
                />
                <Box
                  sx={{
                    top: 0,
                    left: 0,
                    bottom: 0,
                    right: 0,
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="h3" component="div" color="text.secondary">
                    {formatTime(timeLeft)}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={isRunning ? <PauseIcon /> : <PlayArrowIcon />}
                  onClick={handleStartPause}
                >
                  {isRunning ? 'Пауза' : 'Старт'}
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<SkipNextIcon />}
                  onClick={handleSkip}
                >
                  Пропустить
                </Button>
              </Box>
              <Typography variant="subtitle1" sx={{ mt: 2 }}>
                Следующий подход:
              </Typography>
              <Typography variant="h6">
                {currentSet ? `${currentSet.exerciseName} — ${currentSet.reps} повторений${currentSet.weight ? ` | ${currentSet.weight} кг` : ''}` : 'Нет подходов'}
              </Typography>
            </Box>
          ) : (
            <Box>
              <Card sx={{ mb: 4 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h5">
                      {currentSet ? currentSet.exerciseName : 'Нет подходов'}
                    </Typography>
                    <Chip 
                      label={currentSet ? (currentSet.isCompleted ? 'Выполнено' : 'Текущий подход') : ''} 
                      color={currentSet?.isCompleted ? 'success' : 'primary'}
                    />
                  </Box>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={6}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body1" sx={{ mr: 1 }}>
                          Повторений: {currentSet?.reps || 0}
                        </Typography>
                        {!currentSet?.isCompleted && (
                          <IconButton 
                            size="small" 
                            color="primary" 
                            onClick={openEditDialog}
                            aria-label="Изменить количество повторений"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body1">
                        Вес: {currentSet?.weight || 0} кг
                      </Typography>
                    </Grid>
                  </Grid>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button
                      variant="contained"
                      color="success"
                      size="large"
                      startIcon={<CheckCircleIcon />}
                      onClick={completeCurrentSet}
                      disabled={currentSet?.isCompleted}
                    >
                      {currentSet?.isCompleted ? 'Выполнено' : 'Выполнить подход'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
              <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
                Оставшиеся подходы
              </Typography>
              <List>
                {flatSets.filter(s => !s.isCompleted).map((set, idx) => {
                  const isActive = flatSets[activeSetIndex]?.setId === set.setId;
                  return (
                    <ListItem
                      key={set.setId}
                      sx={{
                        bgcolor: isActive ? 'action.selected' : 'background.paper',
                        borderRadius: 1,
                        mb: 1
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {isActive && <FitnessCenterIcon fontSize="small" sx={{ mr: 1 }} />}
                            <Typography variant={isActive ? 'subtitle1' : 'body1'}>
                              {set.exerciseName} — {set.reps} повторений{set.weight ? ` | ${set.weight} кг` : ''}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  );
                })}
              </List>
              {allCompleted && (
                <Box sx={{ textAlign: 'center', mt: 4 }}>
                  <Typography variant="h6" gutterBottom color="success.main">
                    Тренировка завершена!
                  </Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    onClick={handleFinishWorkout}
                  >
                    Сохранить результаты
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Paper>
      </Container>
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
      >
        <DialogTitle>Изменить количество повторений</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Количество повторений"
            type="number"
            fullWidth
            value={editReps}
            onChange={(e) => setEditReps(Math.max(1, parseInt(e.target.value) || 1))}
            inputProps={{ min: 1 }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Отмена</Button>
          <Button onClick={handleEditReps} variant="contained" color="primary">
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WorkoutTimerPage; 
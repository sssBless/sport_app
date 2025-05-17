import { FC, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Container,
  Box,
  Typography,
  Paper,
  Grid,
  CircularProgress,
  Alert,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  LinearProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Check as CheckIcon,
  Timer as TimerIcon,
  Done as DoneIcon,
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
} from '@mui/icons-material';
import { RootState, AppDispatch } from '../../store/store';
import {
  fetchWorkoutById,
  completeSet,
  finishWorkout,
} from '../../store/slices/workoutSlice';
import { ExerciseGrouped, ExerciseSet, Workout } from '../../types';

export const WorkoutTimerPage: FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  
  const { currentWorkout: workout = null, loading = false, workoutInProgress = false } = useSelector(
    (state: RootState) => state.workout as {
      currentWorkout: Workout | null;
      loading: boolean;
      error: string | null;
      workoutInProgress: boolean;
    }
  );
  
  // Состояния для таймера
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [totalWorkoutTimeSeconds, setTotalWorkoutTimeSeconds] = useState(0);
  const [currentRestTimeSeconds, setCurrentRestTimeSeconds] = useState(0);
  const [isRestMode, setIsRestMode] = useState(false);
  
  // Состояние для модального окна подтверждения завершения
  const [isFinishDialogOpen, setIsFinishDialogOpen] = useState(false);
  
  // Загрузка тренировки при монтировании
  useEffect(() => {
    if (id) {
      dispatch(fetchWorkoutById(id));
    }
  }, [dispatch, id]);
  
  // Основной таймер тренировки
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTotalWorkoutTimeSeconds((prev) => prev + 1);
        
        if (isRestMode && currentRestTimeSeconds > 0) {
          setCurrentRestTimeSeconds((prev) => prev - 1);
          if (currentRestTimeSeconds === 1) {
            // Завершение отдыха
            setIsRestMode(false);
          }
        } else {
          setCurrentTimeSeconds((prev) => prev + 1);
        }
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, currentRestTimeSeconds, isRestMode]);
  
  // Установка таймера при начале тренировки
  useEffect(() => {
    if (workoutInProgress && !isTimerRunning) {
      setIsTimerRunning(true);
    }
  }, [workoutInProgress, isTimerRunning]);
  
  // Обработчик завершения подхода
  const handleCompleteSet = (exerciseIndex: number, setIndex: number, setId: string, restSeconds: number = 0) => {
    if (!id) return;
    
    dispatch(completeSet({ workoutId: id, setId }));
    
    if (restSeconds > 0) {
      setIsRestMode(true);
      setCurrentRestTimeSeconds(restSeconds);
    }
  };
  
  // Обработчик завершения тренировки
  const handleFinishWorkout = () => {
    if (!id) return;
    
    dispatch(finishWorkout(id))
      .unwrap()
      .then(() => {
        setIsFinishDialogOpen(false);
        navigate(`/workouts/${id}`);
      });
  };
  
  // Форматирование времени
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!workout) {
    return (
      <Container>
        <Alert severity="error" sx={{ mt: 4 }}>
          Тренировка не найдена
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3, position: 'relative' }}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 2,
                }}
              >
                <Typography variant="h4" component="h1">
                  Тренировка: {workout.name}
                </Typography>
                <Box>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={isTimerRunning ? <PauseIcon /> : <PlayArrowIcon />}
                    onClick={() => setIsTimerRunning(!isTimerRunning)}
                    sx={{ mr: 1 }}
                  >
                    {isTimerRunning ? 'Пауза' : 'Продолжить'}
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<StopIcon />}
                    onClick={() => setIsFinishDialogOpen(true)}
                  >
                    Завершить
                  </Button>
                </Box>
              </Box>
              
              {/* Информация о таймере */}
              <Paper sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item>
                    <TimerIcon color="primary" fontSize="large" />
                  </Grid>
                  <Grid item xs>
                    <Typography variant="h5">
                      {formatTime(totalWorkoutTimeSeconds)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Время тренировки
                    </Typography>
                  </Grid>
                  
                  {isRestMode && (
                    <>
                      <Grid item>
                        <Divider orientation="vertical" flexItem />
                      </Grid>
                      <Grid item xs>
                        <Typography variant="h5" color="warning.main">
                          {formatTime(currentRestTimeSeconds)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Отдых
                        </Typography>
                        <LinearProgress 
                          variant="determinate" 
                          value={currentRestTimeSeconds} 
                          sx={{ mt: 1 }}
                        />
                      </Grid>
                    </>
                  )}
                </Grid>
              </Paper>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Упражнения
              </Typography>
              <List>
                {workout.exercises.map((exercise: ExerciseGrouped, exerciseIndex: number) => (
                  <Paper key={exercise.id} sx={{ mb: 2, overflow: 'hidden' }}>
                    <ListItem sx={{ bgcolor: 'background.paper' }}>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center">
                            <Typography variant="subtitle1">
                              {exercise.name}
                            </Typography>
                          </Box>
                        }
                        secondary={`${exercise.sets.length} подходов`}
                      />
                    </ListItem>
                    <Divider />
                    <List disablePadding>
                      {exercise.sets.map((set: ExerciseSet, setIndex: number) => (
                        <ListItem 
                          key={set.id} 
                          dense
                          sx={{
                            bgcolor: set.is_completed ? 'success.light' : 'transparent',
                            pl: 4,
                            transition: 'background-color 0.3s'
                          }}
                        >
                          <ListItemText
                            primary={`Подход ${set.set_number}`}
                            secondary={`${set.reps} повторений × ${set.weight} кг`}
                          />
                          <IconButton 
                            color={set.is_completed ? "success" : "primary"}
                            onClick={() => handleCompleteSet(exerciseIndex, setIndex, set.id, set.rest_seconds)}
                            disabled={set.is_completed}
                          >
                            <CheckIcon />
                          </IconButton>
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                ))}
              </List>
            </Grid>
          </Grid>
        </Paper>
      </Box>
      
      {/* Диалог подтверждения завершения тренировки */}
      <Dialog
        open={isFinishDialogOpen}
        onClose={() => setIsFinishDialogOpen(false)}
      >
        <DialogTitle>Завершить тренировку?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы действительно хотите завершить текущую тренировку? 
            Все прогресс будет сохранен.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsFinishDialogOpen(false)}>
            Отмена
          </Button>
          <Button onClick={handleFinishWorkout} color="primary" variant="contained" startIcon={<DoneIcon />}>
            Завершить тренировку
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}; 
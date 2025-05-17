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
  Collapse,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Avatar,
  AvatarGroup,
  Tooltip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  DragIndicator as DragIndicatorIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Check as CheckIcon,
  PlayArrow as PlayArrowIcon,
  People as PeopleIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { RootState, AppDispatch } from '../../store/store';
import {
  fetchWorkoutById,
  updateExerciseOrder,
  fetchWorkoutParticipants,
  inviteParticipant,
  startWorkout,
  addExerciseToWorkout,
  removeExerciseFromWorkout,
  addSetToExercise,
  removeSetFromExercise,
  leaveWorkout
} from '../../store/slices/workoutSlice';
import { ExerciseGrouped, ExerciseSet, Workout } from '../../types';

// Компонент для отображения сортируемого элемента упражнения
interface SortableExerciseItemProps {
  exercise: ExerciseGrouped;
  isExpanded: boolean;
  onToggle: () => void;
  onDeleteExercise: (exerciseId: string) => void;
  onAddSet: (exerciseId: string) => void;
  onDeleteSet: (setId: string) => void;
  workoutId: string;
}

const SortableExerciseItem: FC<SortableExerciseItemProps> = ({ 
  exercise, 
  isExpanded, 
  onToggle, 
  onDeleteExercise, 
  onAddSet, 
  onDeleteSet, 
  workoutId 
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: exercise.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Paper 
      elevation={2} 
      sx={{ mb: 2, overflow: 'hidden' }}
      ref={setNodeRef}
      style={style}
    >
      <ListItem 
        sx={{ 
          bgcolor: 'background.paper',
          borderBottom: isExpanded ? '1px solid rgba(0, 0, 0, 0.12)' : 'none'
        }}
      >
        <IconButton
          size="small"
          sx={{ mr: 1 }}
          {...attributes}
          {...listeners}
        >
          <DragIndicatorIcon />
        </IconButton>
        <ListItemText
          primary={
            <Box display="flex" alignItems="center">
              <Typography variant="subtitle1">
                {exercise.name}
              </Typography>
              {exercise.muscle_group && (
                <Chip 
                  label={exercise.muscle_group} 
                  size="small" 
                  variant="outlined" 
                  sx={{ ml: 1 }} 
                />
              )}
            </Box>
          }
          secondary={`${exercise.sets.length} подходов`}
          sx={{ flex: 1 }}
        />
        
        {/* Выносим кнопки в отдельный контейнер */}
        <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto' }}>
          <IconButton onClick={onToggle}>
            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
          <IconButton
            aria-label="edit"
            sx={{ ml: 1 }}
          >
            <EditIcon />
          </IconButton>
          <IconButton 
            aria-label="delete" 
            sx={{ ml: 1 }}
            onClick={() => onDeleteExercise(exercise.id)}
          >
            <DeleteIcon />
          </IconButton>
        </Box>
      </ListItem>
      <Collapse in={isExpanded} timeout="auto">
        <List disablePadding sx={{ pl: 4, pr: 2, pb: 1 }}>
          {exercise.sets.map((set: ExerciseSet) => (
            <ListItem key={set.id} dense>
              <ListItemText
                primary={`Подход ${set.set_number}`}
                secondary={`${set.reps} повторений × ${set.weight} кг${
                  set.rest_seconds ? ` • ${set.rest_seconds}с отдыха` : ''
                }`}
              />
              <Box sx={{ display: 'flex', ml: 'auto' }}>
                <IconButton 
                  color={set.is_completed ? "success" : "default"}
                  size="small"
                  sx={{ mr: 1 }}
                >
                  <CheckIcon />
                </IconButton>
                <IconButton 
                  size="small"
                  onClick={() => onDeleteSet(set.id)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </ListItem>
          ))}
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
            <Button 
              size="small" 
              startIcon={<AddIcon />} 
              color="primary"
              onClick={() => onAddSet(exercise.id)}
            >
              Добавить подход
            </Button>
          </Box>
        </List>
      </Collapse>
    </Paper>
  );
};

export const WorkoutDetails: FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { currentWorkout: workout = null, loading = false } = useSelector(
    (state: RootState) => state.workout as {
      currentWorkout: Workout | null;
      loading: boolean;
      error: string | null;
    }
  );
  
  // Состояние для отслеживания раскрытых упражнений
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  
  // Состояние для модальных окон
  const [isParticipantsDialogOpen, setIsParticipantsDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isAddExerciseDialogOpen, setIsAddExerciseDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [newExercise, setNewExercise] = useState({
    name: '',
    muscleGroup: '',
    sets: 3,
    reps: 10,
    restSeconds: 60
  });

  // Инициализация сенсоров для DnD
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (id) {
      dispatch(fetchWorkoutById(id));
    }
  }, [dispatch, id]);
  
  useEffect(() => {
    if (id) {
      dispatch(fetchWorkoutParticipants(id));
    }
  }, [dispatch, id]);
  
  // Обработчик для переключения раскрытия упражнения
  const handleToggleExercise = (exerciseId: string) => {
    setExpandedExercises(prev => ({
      ...prev,
      [exerciseId]: !prev[exerciseId]
    }));
  };

  // Обработчик завершения перетаскивания
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !workout || active.id === over.id) return;
    
    const oldIndex = workout.exercises.findIndex(
      (exercise) => exercise.id === active.id
    );
    const newIndex = workout.exercises.findIndex(
      (exercise) => exercise.id === over.id
    );
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const updatedExercises = arrayMove(
        [...workout.exercises], 
        oldIndex, 
        newIndex
      ).map((exercise, index) => ({
        ...exercise,
        order: index,
      }));
      
      dispatch(
        updateExerciseOrder({
          workoutId: workout.id,
          exercises: updatedExercises,
        })
      );
    }
  };
  
  // Обработчик для отправки приглашения
  const handleSendInvitation = () => {
    if (id && inviteEmail.trim()) {
      dispatch(inviteParticipant({ workoutId: id, email: inviteEmail }));
      setInviteEmail('');
      setIsInviteDialogOpen(false);
    }
  };
  
  // Обработчик для начала тренировки
  const handleStartWorkout = () => {
    if (id) {
      dispatch(startWorkout(id))
        .unwrap()
        .then(() => {
          // Перейти на страницу с таймером тренировки
          navigate(`/workouts/${id}/timer`);
        });
    }
  };

  // Обработчик удаления упражнения
  const handleDeleteExercise = (exerciseId: string) => {
    if (id && window.confirm('Вы действительно хотите удалить это упражнение?')) {
      dispatch(removeExerciseFromWorkout({ workoutId: id, exerciseId }));
    }
  };
  
  // Обработчик добавления подхода
  const handleAddSet = (exerciseId: string) => {
    if (id) {
      dispatch(addSetToExercise({ 
        workoutId: id, 
        exerciseId, 
        reps: 10, 
        weight: 0,
        restSeconds: 60
      }));
    }
  };
  
  // Обработчик удаления подхода
  const handleDeleteSet = (setId: string) => {
    if (id && window.confirm('Вы действительно хотите удалить этот подход?')) {
      dispatch(removeSetFromExercise({ workoutId: id, setId }));
    }
  };
  
  // Обработчик выхода из тренировки
  const handleLeaveWorkout = () => {
    if (id && window.confirm('Вы действительно хотите выйти из тренировки?')) {
      dispatch(leaveWorkout(id))
        .unwrap()
        .then(() => {
          navigate('/workouts');
        });
    }
  };
  
  // Обработчик добавления нового упражнения
  const handleAddExercise = () => {
    if (id) {
      dispatch(addExerciseToWorkout({
        workoutId: id,
        name: newExercise.name,
        muscleGroup: newExercise.muscleGroup,
        sets: newExercise.sets,
        reps: newExercise.reps,
        restSeconds: newExercise.restSeconds
      }))
        .unwrap()
        .then(() => {
          setIsAddExerciseDialogOpen(false);
          setNewExercise({
            name: '',
            muscleGroup: '',
            sets: 3,
            reps: 10,
            restSeconds: 60
          });
        });
    }
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
        <Paper sx={{ p: 3 }}>
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
                  {workout.name}
                </Typography>
                <Box>
                  {/* Кнопка начала тренировки */}
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<PlayArrowIcon />}
                    sx={{ mr: 1 }}
                    onClick={handleStartWorkout}
                    disabled={workout.is_completed}
                  >
                    Начать тренировку
                  </Button>
                  
                  {/* Кнопка управления участниками */}
                  <Button
                    variant="outlined"
                    startIcon={<PeopleIcon />}
                    onClick={() => setIsParticipantsDialogOpen(true)}
                  >
                    Участники
                  </Button>
                </Box>
              </Box>
              <Typography variant="body1" color="text.secondary" paragraph>
                {workout.description}
              </Typography>
              
              {/* Секция с участниками */}
              {workout.participants && workout.participants.length > 0 && (
                <Box sx={{ mt: 2, mb: 3 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Участники:
                  </Typography>
                  <AvatarGroup max={5}>
                    {workout.participants.map((participant) => (
                      <Tooltip key={participant.id} title={participant.name}>
                        <Avatar>{participant.name.charAt(0)}</Avatar>
                      </Tooltip>
                    ))}
                  </AvatarGroup>
                </Box>
              )}
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3, mb: 2 }}>
                <Typography variant="h6">
                  Упражнения
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => setIsAddExerciseDialogOpen(true)}
                >
                  Добавить упражнение
                </Button>
              </Box>
            </Grid>
            <Grid item xs={12}>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={workout.exercises.map(e => e.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <List>
                    {workout.exercises.map((exercise) => (
                      <SortableExerciseItem
                        key={exercise.id}
                        exercise={exercise}
                        isExpanded={!!expandedExercises[exercise.id]}
                        onToggle={() => handleToggleExercise(exercise.id)}
                        onDeleteExercise={handleDeleteExercise}
                        onAddSet={handleAddSet}
                        onDeleteSet={handleDeleteSet}
                        workoutId={id || ''}
                      />
                    ))}
                  </List>
                </SortableContext>
              </DndContext>
            </Grid>
            
            {/* Если пользователь не создатель, добавляем кнопку для выхода из тренировки */}
            {workout && !workout.is_creator && (
              <Grid item xs={12} sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleLeaveWorkout}
                >
                  Выйти из тренировки
                </Button>
              </Grid>
            )}
          </Grid>
        </Paper>
      </Box>
      
      {/* Диалог для отображения участников */}
      <Dialog open={isParticipantsDialogOpen} onClose={() => setIsParticipantsDialogOpen(false)}>
        <DialogTitle>Участники тренировки</DialogTitle>
        <DialogContent>
          {workout.participants && workout.participants.length > 0 ? (
            <List>
              {workout.participants.map((participant) => (
                <ListItem key={participant.id}>
                  <ListItemText
                    primary={participant.name}
                    secondary={participant.email}
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography>Нет участников</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsInviteDialogOpen(true)} startIcon={<PersonAddIcon />} color="primary">
            Пригласить
          </Button>
          <Button onClick={() => setIsParticipantsDialogOpen(false)}>
            Закрыть
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Диалог для отправки приглашения */}
      <Dialog open={isInviteDialogOpen} onClose={() => setIsInviteDialogOpen(false)}>
        <DialogTitle>Пригласить участника</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="email"
            label="Email адрес"
            type="email"
            fullWidth
            variant="outlined"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsInviteDialogOpen(false)}>
            Отмена
          </Button>
          <Button onClick={handleSendInvitation} color="primary">
            Пригласить
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Диалог для добавления нового упражнения */}
      <Dialog 
        open={isAddExerciseDialogOpen} 
        onClose={() => setIsAddExerciseDialogOpen(false)}
        fullWidth
      >
        <DialogTitle>Добавить упражнение</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="name"
            label="Название упражнения"
            type="text"
            fullWidth
            variant="outlined"
            value={newExercise.name}
            onChange={(e) => setNewExercise({...newExercise, name: e.target.value})}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            id="muscleGroup"
            label="Группа мышц"
            type="text"
            fullWidth
            variant="outlined"
            value={newExercise.muscleGroup}
            onChange={(e) => setNewExercise({...newExercise, muscleGroup: e.target.value})}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            id="sets"
            label="Количество подходов"
            type="number"
            fullWidth
            variant="outlined"
            value={newExercise.sets}
            onChange={(e) => setNewExercise({...newExercise, sets: parseInt(e.target.value) || 1})}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            id="reps"
            label="Количество повторений"
            type="number"
            fullWidth
            variant="outlined"
            value={newExercise.reps}
            onChange={(e) => setNewExercise({...newExercise, reps: parseInt(e.target.value) || 1})}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            id="restSeconds"
            label="Отдых (сек)"
            type="number"
            fullWidth
            variant="outlined"
            value={newExercise.restSeconds}
            onChange={(e) => setNewExercise({...newExercise, restSeconds: parseInt(e.target.value) || 30})}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsAddExerciseDialogOpen(false)}>Отмена</Button>
          <Button onClick={handleAddExercise} color="primary" disabled={!newExercise.name}>
            Добавить
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};
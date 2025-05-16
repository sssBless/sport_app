import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Container,
  Typography,
  Paper,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Card,
  CardContent,
  IconButton,
  Chip,
  Autocomplete,
  CircularProgress,
  Snackbar,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  PlayArrow as PlayArrowIcon,
  Save as SaveIcon,
  DragHandle as DragHandleIcon,
  Check as CheckIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  RestartAlt as RestartAltIcon
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
import { RootState } from '../app/store';
import Navigation from '../components/Navigation';
import { Exercise, ExerciseSet, Workout, updateWorkout, setCurrentWorkout, updateExerciseSet } from '../features/workouts/workoutsSlice';
import api, { createExercise, getExercises } from '../api/axios';

// Тип для плоского подхода
interface FlatSet {
  setId: string;
  exerciseId: string;
  exerciseName: string;
  reps: number;
  weight?: number;
  isCompleted: boolean;
  notes?: string;
}

// Компонент для отдельного подхода
const SortableSetItem = ({
  flatSet,
  index,
  onEditSet,
  onDeleteSet,
  onToggleComplete
}: {
  flatSet: FlatSet;
  index: number;
  onEditSet: (setId: string) => void;
  onDeleteSet: (setId: string) => void;
  onToggleComplete: (setId: string) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
    id: flatSet.setId,
    data: {
      index,
      flatSet
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <Card 
      ref={setNodeRef} 
      style={style} 
      sx={{ 
        mb: 2, 
        border: flatSet.isCompleted ? '1px solid green' : 'none',
        cursor: 'default'
      }}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box {...attributes} {...listeners} sx={{ cursor: 'grab', mr: 2 }}>
          <DragHandleIcon color="action" />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1">
            {flatSet.exerciseName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {flatSet.reps} повторений{flatSet.weight ? ` | ${flatSet.weight} кг` : ''}
          </Typography>
        </Box>
        <IconButton color={flatSet.isCompleted ? 'success' : 'default'} onClick={() => onToggleComplete(flatSet.setId)}>
          <CheckIcon />
        </IconButton>
        <IconButton onClick={() => onEditSet(flatSet.setId)}>
          <EditIcon />
        </IconButton>
        <IconButton onClick={() => onDeleteSet(flatSet.setId)}>
          <DeleteIcon />
        </IconButton>
      </CardContent>
    </Card>
  );
};

const WorkoutPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const workout = useSelector((state: RootState) =>
    state.workouts.items.find(w => w.id === id)
  );

  const [openSetDialog, setOpenSetDialog] = useState(false);
  const [editingSet, setEditingSet] = useState<FlatSet | null>(null);
  const [setForm, setSetForm] = useState({
    exerciseName: '',
    reps: 10,
    weight: 0,
    notes: ''
  });

  const [existingExercises, setExistingExercises] = useState<{id: number; name: string}[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Настройка сенсоров для @dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    console.log('workout:', workout);
    if (workout) {
      console.log('exercises:', workout.exercises);
      workout.exercises.forEach(ex => {
        console.log('exercise:', ex.name, 'sets:', ex.sets);
      });
    }
  }, [workout]);

  // Загружаем список существующих упражнений
  useEffect(() => {
    const fetchExercises = async () => {
      setLoadingExercises(true);
      try {
        // Используем API-функцию, которая обращается к endpoint /api/exercises
        const response = await getExercises();
        console.log('Загруженные упражнения:', response);
        if (response && response.exercises) {
          setExistingExercises(response.exercises);
        }
      } catch (err) {
        console.error('Ошибка при загрузке упражнений:', err);
      } finally {
        setLoadingExercises(false);
      }
    };
    
    fetchExercises();
  }, []);

  // --- Нормализация: плоский массив всех подходов ---
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

  useEffect(() => {
    console.log('flatSets:', flatSets);
  }, [flatSets]);

  // --- CRUD для подхода ---
  const handleEditSet = (setId: string) => {
    const set = flatSets.find(s => s.setId === setId);
    if (set) {
      setEditingSet(set);
      setSetForm({
        exerciseName: set.exerciseName,
        reps: set.reps,
        weight: set.weight || 0,
        notes: set.notes || ''
      });
      setOpenSetDialog(true);
    }
  };

  const handleDeleteSet = async (setId: string) => {
    if (!workout) return;
    // Найти упражнение и индекс подхода
    let found = false;
    const updatedExercises = workout.exercises.map(exercise => {
      if (!Array.isArray(exercise.sets)) return exercise;
      const setIdx = exercise.sets.findIndex(s => s.id === setId);
      if (setIdx !== -1) {
        found = true;
        return {
          ...exercise,
          sets: exercise.sets.filter((_, idx) => idx !== setIdx)
        };
      }
      return exercise;
    });
    if (found) {
      const updatedWorkout = { ...workout, exercises: updatedExercises };
      const response = await api.put(`/workouts/${workout.id}`, updatedWorkout);
      dispatch(updateWorkout(response.data));
    }
  };

  const handleToggleComplete = async (setId: string) => {
    if (!workout) return;
    let found = false;
    const updatedExercises = workout.exercises.map(exercise => {
      if (!Array.isArray(exercise.sets)) return exercise;
      const setIdx = exercise.sets.findIndex(s => s.id === setId);
      if (setIdx !== -1) {
        found = true;
        const set = exercise.sets[setIdx];
        return {
          ...exercise,
          sets: exercise.sets.map((s, idx) => idx === setIdx ? { ...s, isCompleted: !s.isCompleted } : s)
        };
      }
      return exercise;
    });
    if (found) {
      const updatedWorkout = { ...workout, exercises: updatedExercises };
      const response = await api.put(`/workouts/${workout.id}`, updatedWorkout);
      dispatch(updateWorkout(response.data));
    }
  };

  const handleSaveSet = async () => {
    if (!workout) return;
    if (!editingSet) return;
    // Найти упражнение и индекс подхода
    let found = false;
    const updatedExercises = workout.exercises.map(exercise => {
      if (!Array.isArray(exercise.sets)) return exercise;
      if (exercise.id !== editingSet.exerciseId) return exercise;
      const setIdx = exercise.sets.findIndex(s => s.id === editingSet.setId);
      if (setIdx !== -1) {
        found = true;
        return {
          ...exercise,
          sets: exercise.sets.map((s, idx) => idx === setIdx ? {
            ...s,
            reps: setForm.reps,
            weight: setForm.weight,
            notes: setForm.notes
          } : s)
        };
      }
      return exercise;
    });
    if (found) {
      const updatedWorkout = { ...workout, exercises: updatedExercises };
      const response = await api.put(`/workouts/${workout.id}`, updatedWorkout);
      console.log('response.data после редактирования подхода:', response.data);
      dispatch(updateWorkout(response.data));
      setOpenSetDialog(false);
      setEditingSet(null);
    }
  };

  // --- Drag and drop ---
  const handleDragEnd = async (event: DragEndEvent) => {
    if (!workout) return;
    const { active, over } = event;
    
    // Проверяем наличие active и over идентификаторов
    if (!active || !over || !active.id || !over.id || active.id === over.id) {
      console.log('Drag отменен или не имеет достаточно информации:', { active, over });
      return;
    }
    
    // Преобразуем id в строки для надежного поиска
    const activeId = String(active.id);
    const overId = String(over.id);
    
    console.log('Drag перемещение:', { 
      from: activeId,
      to: overId,
      flatSets: flatSets.map(s => s.setId)
    });
    
    const oldIndex = flatSets.findIndex(s => s.setId === activeId);
    const newIndex = flatSets.findIndex(s => s.setId === overId);
    
    if (oldIndex < 0 || newIndex < 0) {
      console.error('Не удалось найти индексы для перемещения:', { oldIndex, newIndex });
      return;
    }
    
    // Перемещаем в плоском массиве
    const newFlatSets = arrayMove(flatSets, oldIndex, newIndex);
    console.log('Новый порядок:', newFlatSets.map(s => s.setId));
    
    // Теперь нужно собрать exercises обратно из плоского массива
    const newExercises: Exercise[] = [];
    const exerciseMap = new Map<string, Exercise>();
    
    newFlatSets.forEach(flatSet => {
      if (!flatSet.exerciseId) {
        console.error('Подход без exerciseId:', flatSet);
        return;
      }
      
      let exercise = exerciseMap.get(flatSet.exerciseId);
      if (!exercise) {
        exercise = {
          id: flatSet.exerciseId,
          name: flatSet.exerciseName,
          sets: [],
        };
        newExercises.push(exercise);
        exerciseMap.set(flatSet.exerciseId, exercise);
      }
      
      const set: ExerciseSet = {
        id: flatSet.setId,
        reps: flatSet.reps,
        weight: flatSet.weight,
        isCompleted: flatSet.isCompleted,
        notes: flatSet.notes || ''
      };
      
      (exercise.sets as ExerciseSet[]).push(set);
    });
    
    console.log('Обновленный список упражнений:', newExercises);
    
    try {
      const updatedWorkout = { ...workout, exercises: newExercises };
      const response = await api.put(`/workouts/${workout.id}`, updatedWorkout);
      dispatch(updateWorkout(response.data));
    } catch (err) {
      console.error('Ошибка при обновлении порядка упражнений:', err);
      setError('Не удалось сохранить новый порядок. Попробуйте еще раз.');
    }
  };

  // --- Добавление нового подхода ---
  const handleAddSet = async () => {
    if (!workout) return;
    
    if (!setForm.exerciseName.trim()) {
      setError('Введите название упражнения');
      return;
    }
    
    if (setForm.reps <= 0) {
      setError('Количество повторений должно быть больше 0');
      return;
    }
    
    // Найти упражнение по имени (или создать новое)
    let exercise = workout.exercises.find(e => e.name === setForm.exerciseName);
    let updatedExercises: Exercise[];
    let exerciseId = exercise?.id;
    
    console.log('Добавление нового подхода:');
    console.log('- Имя упражнения:', setForm.exerciseName);
    console.log('- Существующее упражнение:', exercise);
    
    // Если упражнения нет или у него временный id, создаём на сервере
    if (!exercise || !exerciseId || exerciseId.startsWith('tmp-ex-') || exerciseId.startsWith('ex-')) {
      try {
        console.log('Создаем новое упражнение на сервере:', setForm.exerciseName);
        
        // Сначала проверим, есть ли это упражнение в списке существующих
        const existingExercise = existingExercises.find(e => 
          e.name.toLowerCase() === setForm.exerciseName.toLowerCase()
        );
        console.log('- Найденное существующее упражнение:', existingExercise);
        
        let created;
        if (existingExercise) {
          // Если упражнение уже существует, используем его id
          created = { id: existingExercise.id, name: existingExercise.name };
          console.log('Используем существующее упражнение:', created);
        } else {
          // Иначе создаем новое
          created = await createExercise({ name: setForm.exerciseName });
          console.log('Ответ от createExercise:', created);
        }
        
        exerciseId = String(created.id);
        console.log('- Полученный exerciseId:', exerciseId);
        
        // Обновляем id во всех подходах и упражнениях
        updatedExercises = workout.exercises.map(e =>
          e.name === setForm.exerciseName ? { ...e, id: exerciseId as string } : e
        );
        
        if (!exercise) {
          // Если упражнения не было, добавляем новое
          console.log('Добавляем новое упражнение в workout');
          updatedExercises = [
            ...workout.exercises,
            { id: exerciseId as string, name: setForm.exerciseName, sets: [] }
          ];
        }
      } catch (err) {
        console.error('Ошибка при создании упражнения:', err);
        setError('Не удалось создать упражнение. Попробуйте еще раз.');
        return;
      }
    } else {
      updatedExercises = workout.exercises;
    }
    
    if (!exerciseId) return; // Без id не добавляем подход
    
    // Добавить подход
    const newSet: ExerciseSet = {
      id: `set-${Date.now()}`,
      reps: setForm.reps,
      weight: setForm.weight,
      isCompleted: false,
      notes: setForm.notes
    };
    
    console.log('Новый подход:', newSet);
    
    // Найти упражнение по id (уже с настоящим id)
    const targetExercise = updatedExercises.find(e => e.id === exerciseId);
    if (targetExercise) {
      targetExercise.sets = [...(Array.isArray(targetExercise.sets) ? targetExercise.sets : []), newSet];
    }
    
    const updatedWorkout = { ...workout, exercises: updatedExercises };
    console.log('Отправляем на сервер обновленную тренировку:', updatedWorkout);
    
    try {
      const response = await api.put(`/workouts/${workout.id}`, updatedWorkout);
      console.log('Ответ от сервера после добавления подхода:', response.data);
      dispatch(updateWorkout(response.data));
      setOpenSetDialog(false);
      setSetForm({ exerciseName: '', reps: 10, weight: 0, notes: '' });
    } catch (err) {
      console.error('Ошибка при сохранении подхода:', err);
      setError('Ошибка при сохранении подхода. Проверьте консоль.');
    }
  };

  // Добавляем функцию для сброса прогресса тренировки
  const handleResetWorkout = async () => {
    if (!workout) return;
    
    // Создаем копию тренировки с сброшенными отметками выполнения
    const updatedExercises = workout.exercises.map(exercise => {
      if (!Array.isArray(exercise.sets)) return exercise;
      
      return {
        ...exercise,
        sets: exercise.sets.map(set => ({
          ...set,
          isCompleted: false
        }))
      };
    });
    
    try {
      const updatedWorkout = { ...workout, exercises: updatedExercises };
      const response = await api.put(`/workouts/${workout.id}`, updatedWorkout);
      dispatch(updateWorkout(response.data));
      setError(null);
      // Показываем уведомление об успешном сбросе
      setSuccess('Прогресс тренировки сброшен! Можно начинать заново.');
    } catch (err) {
      console.error('Ошибка при сбросе прогресса тренировки:', err);
      setError('Не удалось сбросить прогресс тренировки. Попробуйте позже.');
    }
  };

  // Добавляем функцию для завершения тренировки с сохранением прогресса
  const handleCompleteWorkout = async () => {
    if (!workout) return;
    
    try {
      const response = await api.patch(`/workouts/${workout.id}/complete`);
      if (response.data && response.data.workout) {
        dispatch(updateWorkout(response.data.workout));
        setSuccess('Тренировка успешно завершена! Прогресс сохранен.');
      }
    } catch (err) {
      console.error('Ошибка при завершении тренировки:', err);
      setError('Не удалось завершить тренировку. Попробуйте позже.');
    }
  };

  // Добавляю функцию handleStartWorkout для перехода на страницу тренировки
  const handleStartWorkout = () => {
    if (workout) {
      navigate(`/workout/${workout.id}/timer`);
    }
  };

  if (!workout) {
    return null;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navigation />
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h4">{workout.name}</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleStartWorkout}
              startIcon={<PlayArrowIcon />}
              sx={{ mr: 2 }}
              disabled={flatSets.length === 0 || (workout?.is_completed)}
            >
              Начать тренировку
            </Button>
            {workout && workout.is_creator && (
              <Button
                variant="contained"
                color="success"
                onClick={handleCompleteWorkout}
                startIcon={<CheckCircleIcon />}
                sx={{ mr: 2 }}
                disabled={flatSets.length === 0 || (workout?.is_completed)}
              >
                Завершить тренировку
              </Button>
            )}
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<RefreshIcon />}
              onClick={handleResetWorkout}
              disabled={flatSets.length === 0 || !flatSets.some(s => s.isCompleted)}
            >
              Сбросить прогресс
            </Button>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setEditingSet(null);
                setSetForm({ exerciseName: '', reps: 10, weight: 0, notes: '' });
                setOpenSetDialog(true);
              }}
            >
              Добавить подход
            </Button>
          </Box>
        </Box>
        
        {flatSets.length === 0 ? (
          <Paper sx={{ p: 4, mb: 4, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>
              Нет упражнений в тренировке
            </Typography>
            <Typography variant="body1" sx={{ mb: 3 }}>
              Добавьте первое упражнение, чтобы начать тренировку
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setEditingSet(null);
                setSetForm({
                  exerciseName: 'Приседания',
                  reps: 10,
                  weight: 20,
                  notes: ''
                });
                setOpenSetDialog(true);
              }}
            >
              Добавить первое упражнение
            </Button>
          </Paper>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            onDragStart={(event) => {
              console.log('Drag started:', event);
            }}
          >
            <SortableContext 
              items={flatSets.map(s => s.setId)} 
              strategy={verticalListSortingStrategy}
            >
              {flatSets.map((flatSet, idx) => (
                <SortableSetItem
                  key={flatSet.setId}
                  flatSet={flatSet}
                  index={idx}
                  onEditSet={handleEditSet}
                  onDeleteSet={handleDeleteSet}
                  onToggleComplete={handleToggleComplete}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
        
        {/* Snackbar для отображения ошибок */}
        <Snackbar 
          open={!!error} 
          autoHideDuration={6000} 
          onClose={() => setError(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        </Snackbar>
        
        <Snackbar 
          open={!!success} 
          autoHideDuration={6000} 
          onClose={() => setSuccess(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert onClose={() => setSuccess(null)} severity="success" sx={{ width: '100%' }}>
            {success}
          </Alert>
        </Snackbar>
        
        <Dialog
          open={openSetDialog}
          onClose={() => {
            setOpenSetDialog(false);
            setEditingSet(null);
          }}
        >
          <DialogTitle>{editingSet ? 'Редактировать подход' : 'Добавить подход'}</DialogTitle>
          <DialogContent>
            {editingSet ? (
              <TextField
                autoFocus
                margin="dense"
                label="Название упражнения"
                fullWidth
                value={setForm.exerciseName}
                onChange={e => setSetForm({ ...setForm, exerciseName: e.target.value })}
                disabled={true}
              />
            ) : (
              <Autocomplete
                freeSolo
                options={existingExercises.map(ex => ex.name)}
                loading={loadingExercises}
                value={setForm.exerciseName}
                onChange={(_, newValue) => {
                  setSetForm({ ...setForm, exerciseName: newValue || '' });
                }}
                onInputChange={(_, newInputValue) => {
                  setSetForm({ ...setForm, exerciseName: newInputValue });
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Название упражнения"
                    margin="dense"
                    fullWidth
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <React.Fragment>
                          {loadingExercises ? <CircularProgress color="inherit" size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </React.Fragment>
                      ),
                    }}
                  />
                )}
              />
            )}
            <TextField
              margin="dense"
              label="Повторений"
              type="number"
              fullWidth
              value={setForm.reps}
              onChange={e => setSetForm({ ...setForm, reps: parseInt(e.target.value) || 0 })}
            />
            <TextField
              margin="dense"
              label="Вес (кг)"
              type="number"
              fullWidth
              value={setForm.weight}
              onChange={e => setSetForm({ ...setForm, weight: parseInt(e.target.value) || 0 })}
            />
            <TextField
              margin="dense"
              label="Заметки"
              fullWidth
              multiline
              rows={2}
              value={setForm.notes}
              onChange={e => setSetForm({ ...setForm, notes: e.target.value })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => {
              setOpenSetDialog(false);
              setEditingSet(null);
            }}>
              Отмена
            </Button>
            <Button
              onClick={editingSet ? handleSaveSet : handleAddSet}
              variant="contained"
              disabled={!setForm.exerciseName || setForm.reps <= 0}
            >
              Сохранить
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
};

export default WorkoutPage; 
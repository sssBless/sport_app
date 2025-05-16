import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Button,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Card,
  CardContent,
  CardActions,
  Alert
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { RootState } from '../app/store';
import Navigation from '../components/Navigation';
import { addWorkout, deleteWorkout, setWorkouts } from '../features/workouts/workoutsSlice';
import { logout } from '../features/auth/authSlice';
import api from '../api/axios';

const WorkoutsPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const workouts = useSelector((state: RootState) => state.workouts.items);
  const auth = useSelector((state: RootState) => state.auth);
  const [openDialog, setOpenDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newWorkout, setNewWorkout] = useState({
    name: '',
    notes: ''
  });

  useEffect(() => {
    if (!auth.isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchWorkouts();
  }, [auth.isAuthenticated]);

  const fetchWorkouts = async () => {
    try {
      const response = await api.get('/workouts');
      console.log('Получены тренировки:', response.data);
      
      // Проверяем формат данных и обрабатываем соответственно
      if (Array.isArray(response.data)) {
        dispatch(setWorkouts(response.data));
      } else if (response.data && Array.isArray(response.data.workouts)) {
        dispatch(setWorkouts(response.data.workouts));
      } else {
        console.error('Неожиданный формат данных:', response.data);
      }
      
      setError(null);
    } catch (err: any) {
      console.error('Ошибка при загрузке тренировок:', err);
      if (err?.response?.status === 401) {
        dispatch(logout());
        navigate('/login');
      }
      setError(err?.response?.data?.error || 'Ошибка при загрузке тренировок');
    }
  };

  const handleCreateWorkout = async () => {
    try {
      const response = await api.post('/workouts', {
        title: newWorkout.name,
        description: newWorkout.notes,
        scheduled_time: new Date().toISOString(),
        exercises: []
      });
      
      console.log('Создана новая тренировка:', response.data);
      
      // Добавляем тренировку в Redux store
      dispatch(addWorkout(response.data));
      
      setOpenDialog(false);
      setNewWorkout({ name: '', notes: '' });
      navigate(`/workout/${response.data.id}`);
    } catch (error) {
      console.error('Ошибка при создании тренировки:', error);
    }
  };

  const handleDeleteWorkout = async (id: string) => {
    try {
      await api.delete(`/workouts/${id}`);
      dispatch(deleteWorkout(id));
    } catch (error) {
      console.error('Ошибка при удалении тренировки:', error);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navigation />
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h4">Мои тренировки</Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Новая тренировка
          </Button>
        </Box>

        <Grid container spacing={3}>
          {workouts.map((workout) => (
            <Grid item xs={12} sm={6} md={4} key={workout.id}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {workout.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(workout.date).toLocaleDateString()}
                  </Typography>
                  <Typography variant="body2">
                    Упражнений: {workout.exercises.length}
                  </Typography>
                  {workout.notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {workout.notes}
                    </Typography>
                  )}
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => navigate(`/workout/${workout.id}`)}
                  >
                    Открыть
                  </Button>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteWorkout(workout.id)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
          <DialogTitle>Новая тренировка</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Название тренировки"
              fullWidth
              value={newWorkout.name}
              onChange={(e) => setNewWorkout({ ...newWorkout, name: e.target.value })}
            />
            <TextField
              margin="dense"
              label="Заметки"
              fullWidth
              multiline
              rows={4}
              value={newWorkout.notes}
              onChange={(e) => setNewWorkout({ ...newWorkout, notes: e.target.value })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Отмена</Button>
            <Button
              onClick={handleCreateWorkout}
              variant="contained"
              disabled={!newWorkout.name}
            >
              Создать
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
};

export default WorkoutsPage; 
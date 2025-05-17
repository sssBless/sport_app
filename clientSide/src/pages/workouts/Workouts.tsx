import { FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch } from '../../store/store';
import {
  Container,
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Fab,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { RootState } from '../../store/store';
import { fetchWorkouts } from '../../store/slices/workoutSlice';
import { WorkoutCard } from '../../components/workouts/WorkoutCard';
import { CreateWorkoutDialog } from '../../components/workouts/CreateWorkoutDialog';
import { Workout } from '../../types';

export const Workouts: FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { workouts = [], loading = false, error = null } = useSelector(
    (state: RootState) => state.workout as {
      workouts: Workout[];
      loading: boolean;
      error: string | null;
    }
  );
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchWorkouts());
  }, [dispatch]);

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

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Мои тренировки
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Grid container spacing={3}>
          {workouts.map((workout: Workout) => (
            <Grid item xs={12} sm={6} md={4} key={workout.id}>
              <WorkoutCard
                workout={workout}
                onSelect={() => navigate(`/workouts/${workout.id}`)}
              />
            </Grid>
          ))}
        </Grid>
        <Fab
          color="primary"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={() => setIsCreateDialogOpen(true)}
        >
          <AddIcon />
        </Fab>
      </Box>
      <CreateWorkoutDialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
      />
    </Container>
  );
}; 
import { FC, useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  Container,
  Box,
  Typography,
  Paper,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import { RootState } from '../../store/store';
import { WorkoutStatistics } from '../../types';

export const Statistics: FC = () => {
  const { statistics = null, loading = false, error = null } = useSelector(
    (state: RootState) => state.workout as {
      statistics: WorkoutStatistics | null;
      loading: boolean; 
      error: string | null;
    }
  );

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

  if (error) {
    return (
      <Container>
        <Alert severity="error" sx={{ mt: 4 }}>
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Статистика тренировок
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Всего тренировок
              </Typography>
              <Typography variant="h3" color="primary">
                {statistics?.totalWorkouts || 0}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Всего упражнений
              </Typography>
              <Typography variant="h3" color="primary">
                {statistics?.totalExercises || 0}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                Общее время (часов)
              </Typography>
              <Typography variant="h3" color="primary">
                {Math.round((statistics?.totalTime || 0) / 60)}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Популярные упражнения
              </Typography>
              <Grid container spacing={2}>
                {statistics?.mostPopularExercises.map((exercise: { name: string; count: number }) => (
                  <Grid item xs={12} sm={6} md={4} key={exercise.name}>
                    <Paper
                      sx={{
                        p: 2,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Typography variant="body1">{exercise.name}</Typography>
                      <Typography variant="h6" color="primary">
                        {exercise.count}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}; 
import React from 'react';
import { useSelector } from 'react-redux';
import { Container, Typography, Grid, Paper, Box } from '@mui/material';
import { RootState } from '../app/store';
import Navigation from '../components/Navigation';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import TimerIcon from '@mui/icons-material/Timer';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

const MainPage: React.FC = () => {
  const auth = useSelector((state: RootState) => state.auth);
  const workouts = useSelector((state: RootState) => state.workouts);

  const stats = {
    totalWorkouts: workouts.items?.length || 0,
    totalTime: workouts.items?.reduce((acc, workout) => acc + (workout.duration || 0), 0) || 0,
    achievements: 0
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navigation />
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Добро пожаловать, {auth.displayName || auth.username}!
        </Typography>
        
        <Grid container spacing={3}>
          {/* Статистика */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <DirectionsRunIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Всего тренировок</Typography>
              <Typography variant="h4">{stats.totalWorkouts}</Typography>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <TimerIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Общее время</Typography>
              <Typography variant="h4">{Math.round(stats.totalTime / 60)} ч</Typography>
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <EmojiEventsIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Достижения</Typography>
              <Typography variant="h4">{stats.achievements}</Typography>
            </Paper>
          </Grid>

          {/* Последние тренировки */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2, mt: 2 }}>
              <Typography variant="h5" gutterBottom>
                Последние тренировки
              </Typography>
              {workouts.items && workouts.items.length > 0 ? (
                <Grid container spacing={2}>
                  {workouts.items.slice(0, 3).map((workout) => (
                    <Grid item xs={12} sm={4} key={workout.id}>
                      <Paper sx={{ p: 2, bgcolor: 'background.paper' }}>
                        <Typography variant="h6">{workout.name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(workout.date).toLocaleDateString()}
                        </Typography>
                        <Typography variant="body1">
                          Продолжительность: {workout.duration ? Math.round(workout.duration / 60) || 0 : 0} мин
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Typography variant="body1" color="text.secondary">
                  У вас пока нет тренировок. Начните прямо сейчас!
                </Typography>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default MainPage; 
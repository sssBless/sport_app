import { FC } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box,
} from '@mui/material';
import {
  FitnessCenter as FitnessCenterIcon,
  Group as GroupIcon,
} from '@mui/icons-material';
import { Workout } from '../../types';

interface WorkoutCardProps {
  workout: Workout;
  onSelect: () => void;
}

export const WorkoutCard: FC<WorkoutCardProps> = ({ workout, onSelect }) => {
  // Проверка наличия полей exercises и participants и что они являются массивами
  const exercisesCount = Array.isArray(workout.exercises) ? workout.exercises.length : 0;
  const participantsCount = Array.isArray(workout.participants) ? workout.participants.length : 0;

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography variant="h6" component="div" gutterBottom>
          {workout.name}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mb: 2,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {workout.description}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <FitnessCenterIcon
            fontSize="small"
            color="action"
            sx={{ mr: 1 }}
          />
          <Typography variant="body2" color="text.secondary">
            {exercisesCount} упражнений
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <GroupIcon fontSize="small" color="action" sx={{ mr: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {participantsCount} участников
          </Typography>
        </Box>
      </CardContent>
      <CardActions>
        <Button size="small" onClick={onSelect}>
          Открыть
        </Button>
      </CardActions>
    </Card>
  );
}; 
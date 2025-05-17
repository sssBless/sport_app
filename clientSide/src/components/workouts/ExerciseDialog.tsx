import { FC, useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Grid,
} from '@mui/material';
import { Exercise } from '../../types';

interface ExerciseDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (exercise: Omit<Exercise, 'id' | 'order'>) => void;
  exercise?: Exercise;
}

export const ExerciseDialog: FC<ExerciseDialogProps> = ({
  open,
  onClose,
  onSave,
  exercise,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    sets: 3,
    reps: 12,
    weight: 0,
    restTime: 60,
  });

  useEffect(() => {
    if (exercise) {
      setFormData({
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        weight: exercise.weight,
        restTime: exercise.restTime || 60,
      });
    }
  }, [exercise]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value =
      e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {exercise ? 'Редактировать упражнение' : 'Добавить упражнение'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  autoFocus
                  name="name"
                  label="Название упражнения"
                  type="text"
                  fullWidth
                  required
                  value={formData.name}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  name="sets"
                  label="Количество подходов"
                  type="number"
                  fullWidth
                  required
                  inputProps={{ min: 1, max: 20 }}
                  value={formData.sets}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  name="reps"
                  label="Количество повторений"
                  type="number"
                  fullWidth
                  required
                  inputProps={{ min: 1, max: 100 }}
                  value={formData.reps}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  name="weight"
                  label="Вес (кг)"
                  type="number"
                  fullWidth
                  inputProps={{ min: 0, step: 0.5 }}
                  value={formData.weight}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  name="restTime"
                  label="Отдых (сек)"
                  type="number"
                  fullWidth
                  inputProps={{ min: 0, max: 600, step: 15 }}
                  value={formData.restTime}
                  onChange={handleChange}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="contained">
            {exercise ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}; 
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppBar, Toolbar, Typography, Button, Box, Avatar, Chip } from '@mui/material';
import { logout } from '../features/auth/authSlice';
import { RootState } from '../app/store';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import { authApi } from '../api/axios';

const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const auth = useSelector((state: RootState) => state.auth);

  const handleLogout = async () => {
    try {
      await authApi.post('/auth/logout');
    } catch (error) {
      console.error('Ошибка при выходе:', error);
    } finally {
      dispatch(logout());
      navigate('/login');
    }
  };

  const userDisplayName = auth.displayName || auth.username || '';
  
  return (
    <AppBar position="static">
      <Toolbar>
        <FitnessCenterIcon sx={{ mr: 2 }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Sport App
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button color="inherit" onClick={() => navigate('/')}>
            Главная
          </Button>
          <Button color="inherit" onClick={() => navigate('/workouts')}>
            Тренировки
          </Button>
          <Button color="inherit" onClick={() => navigate('/profile')}>
            Профиль
          </Button>
          <Chip
            label={userDisplayName}
            color="primary"
            variant="outlined"
            avatar={<Avatar sx={{ bgcolor: 'primary.dark' }}>{userDisplayName.charAt(0).toUpperCase()}</Avatar>}
            sx={{ 
              color: 'white', 
              borderColor: 'rgba(255,255,255,0.5)',
              '& .MuiChip-avatar': { color: 'white' }
            }}
            onClick={() => navigate('/profile')}
          />
          <Button color="inherit" onClick={handleLogout}>
            Выйти
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navigation; 
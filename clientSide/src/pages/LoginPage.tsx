import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { setAuth } from '../features/auth/authSlice';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/axios';
import { TextField, Button, Box, Typography, Alert } from '@mui/material';

const LoginPage: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.post('/auth/login', { username, password });
      const { user, signature } = res.data;
      if (user && user.uuid) {
        await dispatch(setAuth({ 
          uuid: user.uuid,
          username: user.username,
          signature
        }));
        setTimeout(() => {
          navigate('/');
        }, 100);
      } else {
        setError('Неверный ответ от сервера');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default'
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: '100%',
          maxWidth: 400,
          p: 4,
          bgcolor: 'background.paper',
          borderRadius: 1,
          boxShadow: 1
        }}
      >
        <Typography variant="h4" component="h1" gutterBottom>
          Вход
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          margin="normal"
          required
          fullWidth
          label="Имя пользователя"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
        />
        <TextField
          margin="normal"
          required
          fullWidth
          label="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{ mt: 3, mb: 2 }}
          disabled={loading}
        >
          {loading ? 'Вход...' : 'Войти'}
        </Button>
      </Box>
    </Box>
  );
};

export default LoginPage; 
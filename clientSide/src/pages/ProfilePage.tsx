import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Container, Typography, Paper, Box, TextField, Button, Grid, Avatar, Alert } from '@mui/material';
import { RootState } from '../app/store';
import Navigation from '../components/Navigation';
import api, { authApi } from '../api/axios';
import { updateProfile } from '../features/auth/authSlice';

const ProfilePage: React.FC = () => {
  const auth = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    displayName: auth.displayName || '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Обновляем форму при изменении данных в auth
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      displayName: auth.displayName || auth.username || ''
    }));
  }, [auth.displayName, auth.username]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    // Если поле нового пароля заполнено, но не указан текущий пароль
    if (formData.newPassword && !formData.currentPassword) {
      setError('Для изменения пароля необходимо указать текущий пароль');
      return;
    }

    try {
      console.log('Attempting to update profile with data:', {
        displayName: formData.displayName,
        email: Boolean(formData.email),
        hasCurrentPassword: Boolean(formData.currentPassword),
        hasNewPassword: Boolean(formData.newPassword)
      });

      const updateData: any = {};
      if (formData.displayName && formData.displayName !== auth.displayName) {
        updateData.display_name = formData.displayName;
      }
      
      if (formData.email && formData.email.trim()) {
        updateData.email = formData.email;
      }
      
      if (formData.currentPassword && formData.newPassword) {
        updateData.current_password = formData.currentPassword;
        updateData.new_password = formData.newPassword;
      }

      // Проверка, есть ли что обновлять
      if (Object.keys(updateData).length === 0) {
        setSuccess('Нет изменений для обновления');
        return;
      }

      console.log('Sending update request with data:', updateData);
      
      // Добавляем токен авторизации напрямую в заголовок для этого конкретного запроса
      const signature = auth.signature;
      console.log('Using auth token:', signature ? `${signature.substring(0, 5)}...` : 'None');

      if (!signature) {
        setError('Отсутствует токен авторизации. Пожалуйста, войдите снова.');
        return;
      }

      const headers = {
        'Authorization': `Bearer ${signature}`
      };

      console.log('Request headers:', headers);

      // Используем authApi вместо api - важное изменение!
      const response = await authApi.patch('/api/user', updateData, { headers });
      console.log('Profile update response:', response.data);

      // Обновляем displayName в Redux store
      if (updateData.display_name) {
        dispatch(updateProfile({ displayName: updateData.display_name }));
      }

      setSuccess('Профиль успешно обновлен');
      setIsEditing(false);
      
      // Сбрасываем пароли после успешного обновления
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err: any) {
      console.error('Ошибка обновления профиля:', err);
      const errorMessage = err?.response?.data?.error || 'Ошибка при обновлении профиля';
      console.error('Детали ошибки:', {
        message: errorMessage,
        response: err?.response?.data,
        status: err?.response?.status
      });
      setError(errorMessage);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navigation />
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 4 }}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={4} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Avatar
                sx={{ width: 120, height: 120, mb: 2 }}
                src="/default-avatar.png"
              />
              <Typography variant="h5" gutterBottom>
                {auth.displayName || auth.username}
              </Typography>
              {auth.username && auth.displayName && auth.username !== auth.displayName && (
                <Typography variant="body2" color="text.secondary">
                  @{auth.username}
                </Typography>
              )}
            </Grid>

            <Grid item xs={12} md={8}>
              {!isEditing ? (
                <>
                  <Typography variant="h6" gutterBottom>
                    Информация профиля
                  </Typography>
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="body1">
                      <strong>Отображаемое имя:</strong> {auth.displayName || auth.username}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setIsEditing(true)}
                    sx={{ mt: 2 }}
                  >
                    Редактировать профиль
                  </Button>
                </>
              ) : (
                <Box component="form" onSubmit={handleSubmit}>
                  <Typography variant="h6" gutterBottom>
                    Редактирование профиля
                  </Typography>
                  
                  {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      {error}
                    </Alert>
                  )}
                  
                  {success && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      {success}
                    </Alert>
                  )}

                  <TextField
                    fullWidth
                    label="Отображаемое имя"
                    name="displayName"
                    value={formData.displayName}
                    onChange={handleChange}
                    margin="normal"
                    helperText="Это имя будет отображаться в приложении"
                  />

                  <TextField
                    fullWidth
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    margin="normal"
                  />

                  <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
                    Изменение пароля
                  </Typography>

                  <TextField
                    fullWidth
                    label="Текущий пароль"
                    name="currentPassword"
                    type="password"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    margin="normal"
                  />

                  <TextField
                    fullWidth
                    label="Новый пароль"
                    name="newPassword"
                    type="password"
                    value={formData.newPassword}
                    onChange={handleChange}
                    margin="normal"
                  />

                  <TextField
                    fullWidth
                    label="Подтвердите новый пароль"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    margin="normal"
                  />

                  <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      type="submit"
                    >
                      Сохранить
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => setIsEditing(false)}
                    >
                      Отмена
                    </Button>
                  </Box>
                </Box>
              )}
            </Grid>
          </Grid>
        </Paper>
      </Container>
    </Box>
  );
};

export default ProfilePage; 
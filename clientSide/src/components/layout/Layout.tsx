import { FC, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Box, Container, CssBaseline } from '@mui/material';
import { RootState, AppDispatch } from '../../store/store';
import { fetchNotifications } from '../../store/slices/notificationSlice';
import Header from './Header';
import Footer from './Footer';

export const Layout: FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthenticated = useSelector(
    (state: RootState) => state.auth.isAuthenticated as boolean
  );

  // Загружаем уведомления при первом рендере и при смене статуса авторизации
  useEffect(() => {
    if (isAuthenticated) {
      // Загружаем уведомления при успешной авторизации
      dispatch(fetchNotifications());
    }
  }, [isAuthenticated, dispatch]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <CssBaseline />
      {isAuthenticated && <Header />}
      <Container component="main" sx={{ flexGrow: 1, py: 4 }}>
        <Outlet />
      </Container>
      <Footer />
    </Box>
  );
}; 
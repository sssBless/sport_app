import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../app/store';
import { setAuth, logout } from '../features/auth/authSlice';
import { authApi } from '../api/axios';

interface PrivateRouteProps {
  children: React.ReactNode;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const dispatch = useDispatch();
  const auth = useSelector((state: RootState) => state.auth);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      console.log('Проверка авторизации...');
      try {
        const signature = localStorage.getItem('signature');
        console.log('Найденный токен:', signature ? `${signature.substring(0, 5)}...` : 'отсутствует');
        
        if (!signature) {
          console.log('Токен авторизации не найден в localStorage');
          dispatch(logout());
          setIsChecking(false);
          return;
        }
        
        console.log('Выполняется запрос /auth/me...');
        const response = await authApi.get('/auth/me');
        console.log('Ответ /auth/me:', response.data);
        
        if (response.data && response.data.uuid) {
          console.log('Пользователь авторизован:', response.data.username);
          
          // Дополнительный запрос для получения displayName
          console.log('Получение информации о пользователе...');
          try {
            // authApi не имеет префикса /api в baseURL, поэтому добавляем его вручную
            const userResponse = await authApi.get(`/api/user/${response.data.uuid}`);
            console.log('Информация о пользователе:', userResponse.data);
            
            const displayName = userResponse.data?.display_name || response.data.username;
            
            dispatch(setAuth({
              uuid: response.data.uuid,
              username: response.data.username,
              displayName: displayName,
              signature: response.data.signature || signature
            }));
          } catch (userError) {
            console.error('Ошибка получения информации о пользователе:', userError);
            // Если не удалось получить displayName, используем username
            dispatch(setAuth({
              uuid: response.data.uuid,
              username: response.data.username,
              displayName: response.data.username,
              signature: response.data.signature || signature
            }));
          }
        } else {
          console.log('Неверные данные пользователя в ответе API');
          dispatch(logout());
        }
      } catch (error: any) {
        console.error('Ошибка проверки авторизации:', error);
        console.error('Статус ошибки:', error.response?.status);
        console.error('Данные ошибки:', error.response?.data);
        dispatch(logout());
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [dispatch]);

  if (isChecking) {
    return null; // или компонент загрузки
  }

  return auth.isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

export default PrivateRoute; 
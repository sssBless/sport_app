import axios, { AxiosInstance } from 'axios';

// Создаем два экземпляра axios с разными baseURL
const apiInstance = axios.create({
  baseURL: 'http://localhost:3000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

const authInstance = axios.create({
  baseURL: 'http://localhost:3000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Добавляем интерцептор для обработки ошибок
const addErrorInterceptor = (instance: AxiosInstance) => {
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      // Обрабатываем ошибки авторизации
      if (error.response && error.response.status === 401) {
        console.log('Ошибка авторизации:', error.response.data);
      }
      return Promise.reject(error);
    }
  );
  return instance;
};

// Применяем интерцепторы к обоим экземплярам
addErrorInterceptor(apiInstance);
addErrorInterceptor(authInstance);

// Экспортируем оба экземпляра
export { apiInstance, authInstance };

// По умолчанию экспортируем authInstance для обратной совместимости
export default authInstance; 
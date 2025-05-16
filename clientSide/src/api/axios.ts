import axios from 'axios';
import { store } from '../app/store';

// Создаем базовый инстанс с настройками
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Добавляем перехватчик для всех запросов
api.interceptors.request.use((config) => {
  const state = store.getState();
  const signature = state.auth.signature;
  
  console.log('API Request config before setting headers:', {
    url: config.url,
    method: config.method,
    headers: config.headers
  });
  
  if (signature && config.headers) {
    // Используем правильный формат Bearer Token
    // Если заголовок авторизации уже есть в конфиге, не перезаписываем его
    if (!config.headers.Authorization && !config.headers.authorization) {
      config.headers.Authorization = `Bearer ${signature}`;
      console.log('Added Authorization header:', `Bearer ${signature.substring(0, 5)}...`);
    } else {
      console.log('Authorization header already exists, not overriding');
    }
  }
  
  console.log('API Request config after setting headers:', {
    url: config.url,
    method: config.method,
    headers: config.headers
  });
  
  return config;
}, (error) => {
  console.error('Error in API request interceptor:', error);
  return Promise.reject(error);
});

// Добавляем перехватчик ответов
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API response error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
    });
    return Promise.reject(error);
  }
);

// Для маршрутов аутентификации используем другой инстанс без /api префикса
export const authApi = axios.create({
  baseURL: 'http://localhost:3000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Добавляем перехватчик и для authApi
authApi.interceptors.request.use((config) => {
  const state = store.getState();
  const signature = state.auth.signature;
  
  console.log('authApi Request config before setting headers:', {
    url: config.url,
    method: config.method,
    headers: config.headers,
    baseURL: config.baseURL
  });
  
  if (signature && config.headers) {
    // Если заголовок авторизации уже есть в конфиге, не перезаписываем его
    if (!config.headers.Authorization && !config.headers.authorization) {
      // Используем правильный формат Bearer Token
      config.headers.Authorization = `Bearer ${signature}`;
      console.log('authApi: Added Authorization header:', `Bearer ${signature.substring(0, 5)}...`);
    } else {
      console.log('authApi: Authorization header already exists, not overriding');
    }
  }
  
  console.log('authApi Request config after setting headers:', {
    url: config.url,
    method: config.method,
    headers: config.headers
  });
  
  return config;
}, (error) => {
  console.error('Error in authApi request interceptor:', error);
  return Promise.reject(error);
});

// Добавляем перехватчик ответов для authApi
authApi.interceptors.response.use(
  (response) => {
    console.log('authApi response success:', {
      url: response.config.url,
      status: response.status,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('authApi response error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
    });
    return Promise.reject(error);
  }
);

// Создание нового упражнения - этот маршрут остался на /api/exercises
export const createExercise = async (exercise: { name: string; muscle_group?: string; description?: string }) => {
  const response = await api.post('/exercises', exercise);
  return response.data;
};

// Получение списка всех упражнений - этот маршрут остался на /api/exercises
export const getExercises = async () => {
  const response = await api.get('/exercises');
  return response.data;
};

// Получение списка всех упражнений для тренировки - новый маршрут
export const getWorkoutExercises = async () => {
  const response = await api.get('/workout-exercises');
  return response.data;
};

// Добавление упражнения в тренировку
export const addExerciseToWorkout = async (workoutId: string, exerciseData: any) => {
  const response = await api.post(`/workouts/${workoutId}/exercises`, exerciseData);
  return response.data;
};

// Обновление упражнения в тренировке
export const updateWorkoutExercise = async (workoutId: string, exerciseId: string, exerciseData: any) => {
  const response = await api.patch(`/workouts/${workoutId}/exercises/${exerciseId}`, exerciseData);
  return response.data;
};

export default api; 
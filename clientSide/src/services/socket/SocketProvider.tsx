import { FC, createContext, useContext, useEffect, ReactNode, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store/store';
import { addNotification, addServerNotification, addUnreadNotifications, ServerNotification } from '../../store/slices/notificationSlice';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  lastError: string | null;
  sendTestMessage: (userId?: string) => void;
  reconnectSocket: () => void;
}

interface WorkoutUpdateData {
  name: string;
  [key: string]: any;
}

interface ParticipantData {
  userName: string;
  workoutName: string;
  [key: string]: any;
}

interface SocketError {
  message: string;
  [key: string]: any;
}

const SocketContext = createContext<SocketContextType>({ 
  socket: null,
  isConnected: false,
  lastError: null,
  sendTestMessage: () => {},
  reconnectSocket: () => {} 
});

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: FC<SocketProviderProps> = ({ children }) => {
  const dispatch = useDispatch<AppDispatch>();
  const authState = useSelector((state: RootState) => state.auth);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  // Функция для инициализации сокета
  const initializeSocket = () => {
    console.log('Инициализация нового сокета...');
    
    // Создаем Socket.IO клиент с улучшенной конфигурацией
    const newSocket = io('http://localhost:3000', {
      path: '/socket.io', // Явное указание пути
      autoConnect: true, // Подключаемся автоматически
      reconnection: true,
      reconnectionAttempts: 10, // Увеличиваем количество попыток
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000, // Максимальная задержка 5 секунд
      timeout: 20000, // Увеличиваем таймаут ожидания
      transports: ['polling', 'websocket'], // Сначала polling, затем websocket
      withCredentials: true,
      forceNew: true // Принудительно создаем новое соединение
    });
    
    console.log('Новый сокет создан с конфигурацией:', {
      path: '/socket.io',
      autoConnect: true,
      reconnection: true,
      withCredentials: true,
      transports: ['polling', 'websocket']
    });
    
    setSocket(newSocket);
    return newSocket;
  };
  
  // Функция для переподключения сокета
  const reconnectSocket = () => {
    console.log('Выполняется ручное переподключение сокета...');
    
    if (socket) {
      // Закрываем предыдущее соединение
      socket.disconnect();
      console.log('Предыдущий сокет отключен');
    }
    
    // Создаем новый сокет и подключаемся
    const newSocket = initializeSocket();
    newSocket.connect();
    
    dispatch(
      addNotification({
        type: 'info',
        message: 'Выполняется переподключение к серверу уведомлений...',
        duration: 3000,
      })
    );
  };

  // Функция для тестирования сокетов
  const sendTestMessage = (userId?: string) => {
    if (!socket) {
      console.warn('Сокет не создан, нельзя отправить тестовое сообщение');
      dispatch(
        addNotification({
          type: 'warning',
          message: 'Сокет не создан, нельзя отправить тестовое сообщение',
          duration: 5000,
        })
      );
      return;
    }
    
    if (!socket.connected) {
      console.warn('Сокет не подключен, нельзя отправить тестовое сообщение. Статус:', socket.connected);
      dispatch(
        addNotification({
          type: 'warning',
          message: 'Сокет не подключен, нельзя отправить тестовое сообщение',
          duration: 5000,
        })
      );
      return;
    }

    const targetId = userId || authState?.user?.id;
    if (!targetId) {
      console.warn('Нет ID пользователя для тестового сообщения');
      return;
    }

    console.log(`Отправка тестового сообщения пользователю ${targetId}`);
    
    // Эмитируем тестовое событие, которое сервер может обработать
    socket.emit('test_message', { 
      userUuid: targetId,
      message: 'Тестовое сообщение через сокеты'
    });
    
    // Отображаем уведомление
    dispatch(
      addNotification({
        type: 'info',
        message: `Тестовое сообщение отправлено для пользователя ${targetId}`,
        duration: 5000,
      })
    );
  };

  // Эффект для инициализации и настройки сокета
  useEffect(() => {
    console.log('SocketProvider инициализируется с обновленными настройками...');
    
    // Инициализируем сокет с новыми параметрами
    const socket = initializeSocket();
    
    // Настраиваем обработчики событий сокета
    socket.on('connect', () => {
      console.log('WebSocket успешно подключен с ID:', socket.id);
      console.log('Состояние сокета:', socket.connected ? 'подключен' : 'отключен');
      console.log('Используемый транспорт:', socket.io.engine.transport.name);
      setIsConnected(true);
      setLastError(null);
      setReconnectAttempts(0);
      
      // Регистрируем пользователя для получения уведомлений
      if (authState.isAuthenticated && authState.user?.id) {
        console.log('Регистрируем пользователя для уведомлений:', authState.user.id);
        
        socket.emit('register', { userUuid: authState.user.id });
        
        // Отображаем уведомление об успешном подключении
        dispatch(
          addNotification({
            type: 'success',
            message: `Подключение к серверу уведомлений установлено`,
            duration: 3000,
          })
        );
      } else {
        console.warn('Пользователь не авторизован, регистрация для уведомлений не выполнена');
      }
    });

    socket.on('connect_error', (error) => {
      console.error('Ошибка подключения WebSocket:', error);
      console.error('Детали ошибки:', error.message);
      setIsConnected(false);
      setLastError(error.message);
      
      dispatch(
        addNotification({
          type: 'error',
          message: `Ошибка подключения WebSocket: ${error.message}`,
          duration: 5000,
        })
      );
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket отключен по причине:', reason);
      setIsConnected(false);
    });

    socket.on('notification', (notification: ServerNotification) => {
      console.log('Получено уведомление от сервера:', notification);
      // Добавляем уведомление в хранилище
      dispatch(addServerNotification(notification));
      
      // Также показываем всплывающее уведомление
      dispatch(
        addNotification({
          type: notification.type as any,
          message: notification.message,
          duration: 5000,
        })
      );
    });
    
    // Получаем непрочитанные уведомления при подключении
    socket.on('unread_notifications', (notifications: ServerNotification[]) => {
      console.log('Получены непрочитанные уведомления:', notifications.length);
      if (notifications.length > 0) {
        dispatch(addUnreadNotifications(notifications));
      }
    });

    socket.on('error', (error: SocketError) => {
      console.error('Получена ошибка WebSocket:', error);
      setLastError(error.message);
      
      dispatch(
        addNotification({
          type: 'error',
          message: `Ошибка WebSocket: ${error.message}`,
          duration: 5000,
        })
      );
    });

    // Тестовое событие для проверки сокетов
    socket.on('test_response', (data: any) => {
      console.log('Получен ответ на тестовое сообщение:', data);
      dispatch(
        addNotification({
          type: 'success',
          message: `Получен ответ от сервера: ${data.message}`,
          duration: 5000,
        })
      );
    });

    // Обработчик для получения ping от сервера (диагностика)
    socket.on('ping_test', (data) => {
      console.log('Получен диагностический ping от сервера:', data);
      // Отправляем обратно pong для подтверждения активности
      socket.emit('pong_response', { 
        timestamp: new Date().toISOString(),
        receivedPingAt: data.timestamp 
      });
    });

    // Обработчик для приветственного сообщения
    socket.on('welcome', (data) => {
      console.log('Получено приветственное сообщение от сервера:', data);
      if (authState.isAuthenticated && authState.user?.id) {
        // Повторно регистрируемся после получения welcome
        socket.emit('register', { userUuid: authState.user.id });
      }
    });

    // Обработчик для состояния подключения (трассировка)
    socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`Попытка переподключения #${attempt}`);
      setReconnectAttempts(attempt);
      
      if (attempt > 3) {
        dispatch(
          addNotification({
            type: 'warning',
            message: `Попытка переподключения к серверу уведомлений #${attempt}`,
            duration: 3000,
          })
        );
      }
    });

    socket.io.on('reconnect_error', (error) => {
      console.error('Ошибка при попытке переподключения:', error);
    });

    socket.io.on('reconnect_failed', () => {
      console.error('Не удалось переподключиться после всех попыток');
      dispatch(
        addNotification({
          type: 'error',
          message: 'Не удалось подключиться к серверу уведомлений',
          duration: 5000,
        })
      );
    });

    // Теперь подключаемся вручную
    console.log('Выполняется подключение сокета...');
    socket.connect();

    // Запускаем периодическую проверку состояния соединения
    const checkInterval = setInterval(() => {
      if (socket && !socket.connected && isConnected) {
        console.log('Обнаружено расхождение состояния: сокет отключен, но состояние подключено');
        setIsConnected(false);
      }
      
      if (socket && socket.connected) {
        console.log('Проверка соединения: активно');
        // Отправляем ping для проверки соединения
        socket.emit('ping');
      } else {
        console.log('Проверка соединения: не активно');
      }
    }, 10000); // Проверка каждые 10 секунд

    // Функция очистки при размонтировании
    return () => {
      console.log('SocketProvider размонтируется, закрываем соединение...');
      clearInterval(checkInterval);
      
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connect_error');
        socket.off('notification');
        socket.off('unread_notifications');
        socket.off('error');
        socket.off('test_response');
        socket.off('ping_test');
        socket.off('welcome');
        socket.disconnect();
        console.log('Соединение сокета закрыто при размонтировании');
      }
    };
  }, [authState.isAuthenticated, authState.user, dispatch]);

  // Эффект для повторной регистрации пользователя, если сокет уже подключен
  useEffect(() => {
    if (socket && socket.connected && authState.isAuthenticated && authState.user?.id) {
      console.log('Пользователь авторизован, повторная регистрация для уведомлений:', authState.user.id);
      socket.emit('register', { userUuid: authState.user.id });
    }
  }, [socket, authState.isAuthenticated, authState.user?.id]);

  return (
    <SocketContext.Provider value={{ 
      socket, 
      isConnected, 
      lastError,
      sendTestMessage,
      reconnectSocket
    }}>
      {children}
    </SocketContext.Provider>
  );
}; 
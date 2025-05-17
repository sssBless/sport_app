import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { apiInstance } from '../../api/axios';
import { fetchWorkouts } from './workoutSlice';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

export interface ServerNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  status?: string;
  statusText?: string;
  workoutId?: string;
  senderId?: string;
  senderName?: string;
  workoutTitle?: string;
  created_at: string;
  is_read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  serverNotifications: ServerNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

const initialState: NotificationState = {
  notifications: [],
  serverNotifications: [],
  unreadCount: 0,
  loading: false,
  error: null
};

export const fetchNotifications = createAsyncThunk(
  'notification/fetchNotifications',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiInstance.get('/notifications');
      return response.data.notifications;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Ошибка загрузки уведомлений');
    }
  }
);

export const acceptInvitation = createAsyncThunk(
  'notification/acceptInvitation',
  async (invitationId: string, { rejectWithValue, dispatch, getState }) => {
    try {
      await apiInstance.post('/notifications/accept', { invitationId });
      
      // Показываем уведомление пользователю
      dispatch(addNotification({
        type: 'success',
        message: 'Приглашение принято успешно!'
      }));
      
      // Обновляем список уведомлений
      dispatch(fetchNotifications());
      
      // Обновляем список тренировок после принятия приглашения
      dispatch(fetchWorkouts());
      
      return invitationId;
    } catch (error: any) {
      dispatch(addNotification({
        type: 'error',
        message: error.response?.data?.error || 'Ошибка при принятии приглашения'
      }));
      return rejectWithValue(error.response?.data?.error || 'Ошибка при принятии приглашения');
    }
  }
);

export const declineInvitation = createAsyncThunk(
  'notification/declineInvitation',
  async (invitationId: string, { rejectWithValue, dispatch }) => {
    try {
      await apiInstance.post('/notifications/decline', { invitationId });
      
      // Показываем уведомление пользователю
      dispatch(addNotification({
        type: 'success',
        message: 'Приглашение отклонено'
      }));
      
      // Обновляем список уведомлений
      dispatch(fetchNotifications());
      
      return invitationId;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Ошибка при отклонении приглашения';
      console.error('Ошибка отклонения приглашения:', error.response?.data);
      
      // Добавляем уведомление об ошибке
      dispatch(addNotification({
        type: 'error',
        message: errorMessage
      }));
      
      return rejectWithValue(errorMessage);
    }
  }
);

// Локальная (клиентская) отметка о прочтении уведомления
export const markNotificationAsRead = createAsyncThunk(
  'notification/markAsRead',
  async (notificationId: string, { dispatch }) => {
    // Просто обновляем локальное состояние без обращения к серверу
    return notificationId;
  }
);

// Локальная (клиентская) отметка всех уведомлений как прочитанных  
export const markAllNotificationsAsRead = createAsyncThunk(
  'notification/markAllAsRead',
  async () => {
    // Просто обновляем локальное состояние без обращения к серверу
    return true;
  }
);

// Автоматическая проверка уведомлений при успешной авторизации
export const checkNotificationsAfterLogin = createAsyncThunk(
  'notification/checkAfterLogin',
  async (_, { dispatch }) => {
    try {
      // Получаем все уведомления
      const response = await apiInstance.get('/notifications');
      const notifications = response.data.notifications || [];
      
      // Если есть уведомления, проверяем нужно ли обновить список тренировок
      if (notifications.length > 0) {
        // Проверяем, есть ли принятые приглашения
        const hasAcceptedInvitations = notifications.some(
          (n: ServerNotification) => n.type === 'invitation' && n.status === 'accepted'
        );
        
        // Если есть принятые приглашения, обновляем список тренировок
        if (hasAcceptedInvitations) {
          dispatch(fetchWorkouts());
        }
      }
      
      return notifications;
    } catch (error: any) {
      console.error('Ошибка при проверке уведомлений:', error);
      return [];
    }
  }
);

export const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {
    addNotification: (
      state,
      action: PayloadAction<Omit<Notification, 'id'>>
    ) => {
      const id = Date.now().toString();
      state.notifications.push({
        ...action.payload,
        id,
      });
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== action.payload
      );
    },
    addServerNotification: (
      state,
      action: PayloadAction<ServerNotification>
    ) => {
      // Проверяем, нет ли уже такого уведомления
      const exists = state.serverNotifications.some(
        n => n.id === action.payload.id
      );

      if (!exists) {
        state.serverNotifications.unshift(action.payload);
        if (!action.payload.is_read) {
          state.unreadCount += 1;
        }
      }
    },
    addUnreadNotifications: (
      state,
      action: PayloadAction<ServerNotification[]>
    ) => {
      // Добавляем все уведомления, избегая дубликатов
      const newNotifications = action.payload.filter(
        newNotif => !state.serverNotifications.some(
          existing => existing.id === newNotif.id
        )
      );
      
      state.serverNotifications = [...newNotifications, ...state.serverNotifications];
      state.unreadCount += newNotifications.filter(n => !n.is_read).length;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.serverNotifications = action.payload;
        state.unreadCount = action.payload.filter((n: ServerNotification) => !n.is_read).length;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(markNotificationAsRead.fulfilled, (state, action) => {
        const notif = state.serverNotifications.find(n => n.id === action.payload);
        if (notif && !notif.is_read) {
          notif.is_read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAllNotificationsAsRead.fulfilled, (state) => {
        state.serverNotifications.forEach(n => {
          n.is_read = true;
        });
        state.unreadCount = 0;
      })
      .addCase(acceptInvitation.pending, (state, action) => {
        // Оптимистично обновляем UI - отмечаем приглашение как принятое
        const invitationId = action.meta.arg;
        const invitation = state.serverNotifications.find(n => n.id === invitationId);
        if (invitation) {
          invitation.status = 'accepted';
          invitation.statusText = 'Принято';
          invitation.is_read = true;
        }
      })
      .addCase(acceptInvitation.fulfilled, (state, action) => {
        // Нет необходимости что-то делать здесь, т.к. состояние уже обновлено
        // и fetchNotifications уже запущен выше
      })
      .addCase(declineInvitation.pending, (state, action) => {
        // Оптимистично обновляем UI - отмечаем приглашение как отклоненное
        const invitationId = action.meta.arg;
        const invitation = state.serverNotifications.find(n => n.id === invitationId);
        if (invitation) {
          invitation.status = 'declined';
          invitation.statusText = 'Отклонено';
          invitation.is_read = true;
        }
      })
      .addCase(declineInvitation.fulfilled, (state, action) => {
        // Нет необходимости что-то делать здесь, т.к. состояние уже обновлено
        // и fetchNotifications уже запущен выше
      })
      .addCase(checkNotificationsAfterLogin.fulfilled, (state, action) => {
        state.loading = false;
        state.serverNotifications = action.payload;
        state.unreadCount = action.payload.filter((n: ServerNotification) => !n.is_read).length;
      });
  }
});

export const { 
  addNotification, 
  removeNotification, 
  addServerNotification, 
  addUnreadNotifications 
} = notificationSlice.actions;

export default notificationSlice.reducer; 
import { FC, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  Container, 
  Typography, 
  Paper, 
  Box, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText, 
  Divider, 
  Button, 
  ButtonGroup,
  Chip,
  CircularProgress,
  Alert,
  FormControlLabel,
  Switch
} from '@mui/material';
import { 
  Notifications as NotificationsIcon,
  Check,
  Close,
  CheckCircle,
  Info,
  Warning,
  Error,
  PersonAdd,
  MarkEmailRead
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { RootState, AppDispatch } from '../../store/store';
import { 
  ServerNotification, 
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  acceptInvitation,
  declineInvitation
} from '../../store/slices/notificationSlice';

const getIconByType = (type: string) => {
  switch (type.toLowerCase()) {
    case 'success':
      return <CheckCircle color="success" />;
    case 'warning':
      return <Warning color="warning" />;
    case 'error':
      return <Error color="error" />;
    case 'invitation':
      return <PersonAdd color="primary" />;
    case 'info':
    default:
      return <Info color="info" />;
  }
};

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    return format(date, 'dd MMMM yyyy, HH:mm', { locale: ru });
  } catch {
    return 'Недавно';
  }
};

export const NotificationsPage: FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { serverNotifications, loading, error, unreadCount } = useSelector(
    (state: RootState) => state.notification
  );
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    dispatch(fetchNotifications());
  }, [dispatch]);

  const handleMarkAllAsRead = () => {
    dispatch(markAllNotificationsAsRead());
  };

  const handleReadNotification = (notificationId: string) => {
    dispatch(markNotificationAsRead(notificationId));
  };

  const handleAcceptInvitation = (invitationId: string) => {
    dispatch(acceptInvitation(invitationId));
  };

  const handleDeclineInvitation = (invitationId: string) => {
    dispatch(declineInvitation(invitationId));
  };

  // Фильтруем уведомления в зависимости от настройки показа решенных уведомлений
  const filteredNotifications = serverNotifications.filter(notification => {
    // Если showResolved включен, показываем все уведомления
    if (showResolved) {
      return true;
    }
    
    // Если это приглашение, показываем только те, что в статусе pending
    if (notification.type === 'invitation') {
      return notification.status === 'pending';
    }
    
    // Другие типы уведомлений показываем всегда
    return true;
  });

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4" component="h1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <NotificationsIcon sx={{ mr: 1 }} />
            Уведомления
            {unreadCount > 0 && (
              <Chip 
                label={`${unreadCount} новых`} 
                color="error" 
                size="small" 
                sx={{ ml: 2 }}
              />
            )}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Switch 
                  checked={showResolved} 
                  onChange={(e) => setShowResolved(e.target.checked)} 
                />
              }
              label="Показать решенные"
              sx={{ mr: 2 }}
            />
            
            {unreadCount > 0 && (
              <Button
                variant="outlined"
                startIcon={<MarkEmailRead />}
                onClick={handleMarkAllAsRead}
              >
                Прочитать все
              </Button>
            )}
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Paper elevation={2}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : filteredNotifications.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                {showResolved 
                  ? 'У вас нет уведомлений' 
                  : 'У вас нет активных уведомлений. Включите опцию "Показать решенные", чтобы увидеть историю.'}
              </Typography>
            </Box>
          ) : (
            <List>
              {filteredNotifications.map((notification, index) => (
                <Box key={notification.id}>
                  {index > 0 && <Divider component="li" />}
                  <ListItem
                    alignItems="flex-start"
                    sx={{
                      p: 3,
                      backgroundColor: notification.is_read ? 'inherit' : 'rgba(25, 118, 210, 0.05)',
                    }}
                  >
                    <ListItemIcon>
                      {getIconByType(notification.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography variant="h6" component="span">
                            {notification.title}
                          </Typography>
                          {notification.status && (
                            <Chip 
                              size="small" 
                              label={notification.statusText} 
                              color={
                                notification.status === 'pending' ? 'primary' : 
                                notification.status === 'accepted' ? 'success' : 
                                notification.status === 'declined' ? 'error' : 'default'
                              }
                              sx={{ ml: 1 }} 
                            />
                          )}
                          {!notification.is_read && (
                            <Chip 
                              size="small" 
                              label="Новое" 
                              color="error" 
                              variant="outlined"
                              sx={{ ml: 1 }} 
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography
                            sx={{ display: 'block', my: 1 }}
                            component="span"
                            variant="body1"
                            color="text.primary"
                          >
                            {notification.message}
                          </Typography>
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.secondary"
                          >
                            {formatDate(notification.created_at)}
                          </Typography>
                          
                          {notification.type === 'invitation' && notification.status === 'pending' && (
                            <Box sx={{ mt: 2 }}>
                              <ButtonGroup>
                                <Button
                                  startIcon={<Close />}
                                  color="error"
                                  variant="outlined"
                                  onClick={() => handleDeclineInvitation(notification.id)}
                                >
                                  Отклонить
                                </Button>
                                <Button
                                  startIcon={<Check />}
                                  color="success"
                                  variant="contained"
                                  onClick={() => handleAcceptInvitation(notification.id)}
                                >
                                  Принять
                                </Button>
                              </ButtonGroup>
                            </Box>
                          )}
                        </>
                      }
                    />
                    
                    {!notification.is_read && notification.type !== 'invitation' && (
                      <Button
                        size="small"
                        onClick={() => handleReadNotification(notification.id)}
                        sx={{ minWidth: 'auto', ml: 2 }}
                      >
                        Прочитано
                      </Button>
                    )}
                  </ListItem>
                </Box>
              ))}
            </List>
          )}
        </Paper>
      </Box>
    </Container>
  );
}; 
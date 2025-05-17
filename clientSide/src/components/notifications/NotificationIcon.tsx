import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Box,
  Divider,
  ListItemText,
  ListItemIcon,
  Button,
  CircularProgress,
  Stack,
  ButtonGroup,
  Chip
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  CheckCircle,
  Info,
  Warning,
  Error,
  MarkEmailRead,
  Check,
  Close,
  PersonAdd,
  OpenInNew
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { RootState, AppDispatch } from '../../store/store';
import { 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  ServerNotification,
  fetchNotifications,
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
    return format(date, 'dd MMM, HH:mm', { locale: ru });
  } catch {
    return 'Недавно';
  }
};

const NotificationIcon = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { serverNotifications, unreadCount, loading } = useSelector(
    (state: RootState) => state.notification
  );
  
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  
  // Фильтруем уведомления, оставляя только активные
  const activeNotifications = serverNotifications.filter(notification => {
    // Если это приглашение, показываем только те, что в статусе pending
    if (notification.type === 'invitation') {
      return notification.status === 'pending';
    }
    
    // Другие типы уведомлений показываем всегда
    return true;
  });

  // Группировка уведомлений по типам для вывода статистики
  const notificationStats = serverNotifications.reduce((stats, notification) => {
    if (notification.type === 'invitation') {
      if (notification.status === 'pending') {
        stats.pendingInvitations++;
      } else if (notification.status === 'accepted') {
        stats.acceptedInvitations++;
      } else if (notification.status === 'declined') {
        stats.declinedInvitations++;
      }
    }
    return stats;
  }, { 
    pendingInvitations: 0, 
    acceptedInvitations: 0, 
    declinedInvitations: 0 
  });

  const handleIconClick = (event: React.MouseEvent<HTMLElement>) => {
    dispatch(fetchNotifications());
    setAnchorEl(event.currentTarget);
  };
  
  const handleClose = () => {
    setAnchorEl(null);
  };
  
  const handleReadNotification = (notificationId: string) => {
    dispatch(markNotificationAsRead(notificationId));
  };
  
  const handleMarkAllAsRead = () => {
    dispatch(markAllNotificationsAsRead());
  };

  const handleAcceptInvitation = (invitationId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Предотвращаем закрытие меню
    dispatch(acceptInvitation(invitationId));
  };

  const handleDeclineInvitation = (invitationId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Предотвращаем закрытие меню
    dispatch(declineInvitation(invitationId));
  };

  const handleViewAllNotifications = () => {
    handleClose(); // Закрываем меню
    navigate('/notifications'); // Переходим на страницу уведомлений
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleIconClick}
        sx={{ 
          ml: 1,
          animation: unreadCount > 0 ? 'pulse 2s infinite' : 'none',
          '@keyframes pulse': {
            '0%': { transform: 'scale(1)' },
            '5%': { transform: 'scale(1.1)' },
            '10%': { transform: 'scale(1)' },
            '100%': { transform: 'scale(1)' }
          }
        }}
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            width: 400, // Увеличил ширину
            maxHeight: 600, // Увеличил высоту
            overflow: 'auto'
          }
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Уведомления</Typography>
          <Box>
            {unreadCount > 0 && (
              <Button
                size="small"
                startIcon={<MarkEmailRead />}
                onClick={handleMarkAllAsRead}
                sx={{ mr: 1 }}
              >
                Прочитать все
              </Button>
            )}
            <Button
              size="small"
              startIcon={<OpenInNew />}
              onClick={handleViewAllNotifications}
            >
              Все уведомления
            </Button>
          </Box>
        </Box>
        
        <Divider />
        
        {/* Статистика уведомлений */}
        {serverNotifications.length > 0 && (
          <>
            <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-around' }}>
              {notificationStats.pendingInvitations > 0 && (
                <Chip
                  icon={<Info />}
                  label={`Ожидает: ${notificationStats.pendingInvitations}`}
                  color="primary"
                  size="small"
                  sx={{ mr: 1 }}
                />
              )}
              {notificationStats.acceptedInvitations > 0 && (
                <Chip
                  icon={<CheckCircle />}
                  label={`Принято: ${notificationStats.acceptedInvitations}`}
                  color="success"
                  size="small"
                  sx={{ mr: 1 }}
                />
              )}
              {notificationStats.declinedInvitations > 0 && (
                <Chip
                  icon={<Close />}
                  label={`Отклонено: ${notificationStats.declinedInvitations}`}
                  color="error"
                  size="small"
                />
              )}
            </Box>
            <Divider />
          </>
        )}
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : activeNotifications.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              Нет активных уведомлений
            </Typography>
          </MenuItem>
        ) : (
          // Показываем только первые 5 уведомлений в выпадающем меню
          activeNotifications.slice(0, 5).map((notification: ServerNotification) => (
            <MenuItem
              key={notification.id}
              onClick={() => {
                if (!notification.is_read) {
                  handleReadNotification(notification.id);
                }
              }}
              sx={{
                backgroundColor: notification.is_read ? 'inherit' : 'rgba(25, 118, 210, 0.08)',
                '&:hover': {
                  backgroundColor: notification.is_read ? undefined : 'rgba(25, 118, 210, 0.12)',
                },
                display: 'block',
                py: 1.5,
                px: 2
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                  {getIconByType(notification.type)}
                </ListItemIcon>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="subtitle2" noWrap>
                    {notification.title}
                    {notification.status && (
                      <Chip 
                        size="small" 
                        label={notification.statusText} 
                        color={
                          notification.status === 'pending' ? 'primary' : 
                          notification.status === 'accepted' ? 'success' : 
                          notification.status === 'declined' ? 'error' : 'default'
                        }
                        sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} 
                      />
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {notification.message}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(notification.created_at)}
                  </Typography>
                </Box>
              </Box>
              
              {/* Показываем кнопки только для приглашений со статусом "pending" */}
              {notification.type === 'invitation' && notification.status === 'pending' && (
                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  <ButtonGroup size="small">
                    <Button
                      startIcon={<Close />}
                      color="error"
                      onClick={(e) => handleDeclineInvitation(notification.id, e)}
                    >
                      Отклонить
                    </Button>
                    <Button
                      startIcon={<Check />}
                      color="success"
                      onClick={(e) => handleAcceptInvitation(notification.id, e)}
                    >
                      Принять
                    </Button>
                  </ButtonGroup>
                </Box>
              )}
            </MenuItem>
          ))
        )}
        
        {activeNotifications.length > 5 && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Button
              variant="text"
              color="primary"
              onClick={handleViewAllNotifications}
            >
              Показать все ({activeNotifications.length})
            </Button>
          </Box>
        )}
      </Menu>
    </>
  );
};

export default NotificationIcon; 
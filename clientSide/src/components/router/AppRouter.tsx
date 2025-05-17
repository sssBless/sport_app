import { FC } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import { Layout } from '../layout/Layout';
import { PrivateRoute } from './PrivateRoute';

// Pages
import { Login } from '../../pages/auth/Login';
import { Register } from '../../pages/auth/Register';
import { Profile } from '../../pages/profile/Profile';
import { Workouts } from '../../pages/workouts/Workouts';
import { WorkoutDetails } from '../../pages/workouts/WorkoutDetails';
import { WorkoutTimerPage } from '../../pages/workouts/WorkoutTimerPage';
import { Statistics } from '../../pages/statistics/Statistics';
import { NotificationsPage } from '../../pages/notifications/NotificationsPage';

export const AppRouter: FC = () => {
  const isAuthenticated = useSelector(
    (state: RootState) => state.auth.isAuthenticated as boolean
  );

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        {/* Public routes */}
        <Route path="login" element={!isAuthenticated ? <Login /> : <Navigate to="/workouts" />} />
        <Route path="register" element={!isAuthenticated ? <Register /> : <Navigate to="/workouts" />} />

        {/* Protected routes */}
        <Route element={<PrivateRoute />}>
          <Route path="profile" element={<Profile />} />
          <Route path="workouts" element={<Workouts />} />
          <Route path="workouts/:id" element={<WorkoutDetails />} />
          <Route path="workouts/:id/timer" element={<WorkoutTimerPage />} />
          <Route path="statistics" element={<Statistics />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>

        {/* Default route */}
        <Route path="/" element={<Navigate to={isAuthenticated ? "/workouts" : "/login"} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}; 
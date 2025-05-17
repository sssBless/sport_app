import { FC } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';

export const PrivateRoute: FC = () => {
  const isAuthenticated = useSelector(
    (state: RootState) => state.auth.isAuthenticated as boolean
  );

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" />;
}; 
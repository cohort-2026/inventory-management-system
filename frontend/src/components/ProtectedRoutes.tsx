
import { Navigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import LoadingState from './LoadingState';
import AccessDeniedState from './AccessDeniedState';

import type { ReactNode } from 'react';

type SystemRole =
  | 'Manager'
  | 'Inventory Staff'
  | 'Viewer';

type ProtectedRouteProps = {
  children: ReactNode;
  allowedRoles?: SystemRole[];
};

export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingState message="Checking permissions…" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (
    allowedRoles &&
    !allowedRoles.includes(
      user.roleName as SystemRole,
    )
  ) {
    return <AccessDeniedState />;
  }

  return <>{children}</>;
}


import { Navigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';

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
    return <div role="status">Loading...</div>;
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
    return (
      <div
        role="alert"
        style={{ padding: 'var(--space-5)' }}
      >
        <h1>Access Denied</h1>
        <p>
          Your account does not have permission
          to access this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

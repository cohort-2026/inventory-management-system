
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import type { ReactNode } from 'react';

import {
  AUTH_API_BASE,
} from '../services/authConfig';

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  roleId: string;
  status: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  roleName?: 'Manager' | 'Inventory Staff' | 'Viewer' | null;
};

export type RegistrationResult = {
  message: string;
  confirmationRequired: boolean;
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<void>;
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => Promise<RegistrationResult>;
  logout: () => Promise<void>;
};

type ServerUser = {
  id: string;
  email: string;
  roleId: string;
  status: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  roleName?: 'Manager' | 'Inventory Staff' | 'Viewer' | null;
};

const AuthContext =
  createContext<AuthContextType | undefined>(
    undefined,
  );

function normalizeUser(
  user: ServerUser,
): AuthUser {
  return {
    ...user,
    username: user.email,
  };
}

async function authRequest(
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const response = await fetch(
    `${AUTH_API_BASE}${path}`,
    {
      ...options,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    },
  );

  const body: unknown =
    await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : 'Authentication request failed';

    throw new Error(message);
  }

  return body;
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] =
    useState<AuthUser | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let active = true;

    authRequest('/me')
      .then((data: { user: ServerUser }) => {
        if (active) {
          setUser(normalizeUser(data.user));
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function login(
    email: string,
    password: string,
  ): Promise<void> {
    await authRequest(
      '/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      },
    );

    const me = await authRequest('/me') as {
      user: ServerUser;
    };

    setUser(normalizeUser(me.user));
  }

  async function register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ): Promise<RegistrationResult> {
    const data = await authRequest(
      '/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
        }),
      },
    ) as RegistrationResult;

    return {
      message:
        typeof data.message === 'string'
          ? data.message
          : 'Registration submitted.',
      confirmationRequired:
        data.confirmationRequired !== false,
    };
  }

  async function logout(): Promise<void> {
    try {
      await authRequest('/logout', {
        method: 'POST',
        body: '{}',
      });
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used inside AuthProvider',
    );
  }

  return context;
}
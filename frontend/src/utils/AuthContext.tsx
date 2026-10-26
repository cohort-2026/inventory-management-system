
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import type { ReactNode } from 'react';

const API_URL =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000';

const AUTH_URL = `${API_URL}/api/supabase-auth`;

type User = {
  id: string;
  email: string;
  username: string;
  roleId: string;
  status: string;
};

export type RegistrationResult = {
  message: string;
  confirmationRequired: boolean;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<RegistrationResult>;
  logout: () => Promise<void>;
};

type ServerUser = {
  id: string;
  email: string;
  roleId: string;
  status: string;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

function normalizeUser(user: ServerUser): User {
  return {
    ...user,
    username: user.email,
  };
}

async function authRequest(
  path: string,
  options: RequestInit = {},
) {
  const response = await fetch(`${AUTH_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? 'Authentication failed');
  }

  return body;
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    authRequest('/me')
      .then((data) => {
        if (mounted) {
          setUser(normalizeUser(data.user));
        }
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const data = await authRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    setUser(normalizeUser(data.user));
  }

  async function register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ): Promise<RegistrationResult> {
    const data = await authRequest('/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, firstName, lastName }),
    });

    return {
      message: typeof data.message === 'string' ? data.message : 'Registration submitted.',
      confirmationRequired: data.confirmationRequired !== false,
    };
  }

  async function logout() {
    try {
      await authRequest('/logout', {
        method: 'POST',
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

export function useAuth() {
  return useContext(AuthContext);
}

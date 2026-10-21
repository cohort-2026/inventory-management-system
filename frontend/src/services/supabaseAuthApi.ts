
import axios from 'axios';

const API_URL =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api/supabase-auth`,
  timeout: 15000,
});

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  roleId: string;
  status: string;
}

export async function loginWithSupabase(
  email: string,
  password: string
): Promise<AuthSession> {
  const response = await api.post<AuthSession>(
    '/login',
    { email, password }
  );

  return response.data;
}

export async function getAuthenticatedUser(
  accessToken: string
): Promise<AuthenticatedUser> {
  const response = await api.get<{
    user: AuthenticatedUser;
  }>('/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data.user;
}

export type AuthProviderName = 'custom' | 'supabase';

const configuredProvider = import.meta.env.VITE_AUTH_PROVIDER;

export const authProvider: AuthProviderName =
  configuredProvider === 'supabase'
    ? 'supabase'
    : 'custom';

const apiOrigin =
  (import.meta.env.VITE_API_URL ?? 'http://localhost:5000')
    .replace(/\/$/, '');

export const AUTH_API_BASE =
  `${apiOrigin}/api/${
    authProvider === 'custom'
      ? 'custom-auth'
      : 'supabase-auth'
  }`;

export const customAuthEnabled =
  authProvider === 'custom';
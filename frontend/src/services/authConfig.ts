
export type AuthProviderName = 'custom' | 'supabase';

const configuredProvider =
  import.meta.env.VITE_AUTH_PROVIDER;

export const authProvider: AuthProviderName =
  import.meta.env.DEV &&
  configuredProvider === 'custom'
    ? 'custom'
    : 'supabase';

const apiOrigin =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000';

export const AUTH_API_BASE =
  `${apiOrigin}/api/${
    authProvider === 'custom'
      ? 'custom-auth'
      : 'supabase-auth'
  }`;

export const customAuthEnabled =
  authProvider === 'custom';

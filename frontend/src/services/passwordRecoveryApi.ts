
import {
  AUTH_API_BASE,
  customAuthEnabled,
} from './authConfig';

type RecoveryResponse = {
  message?: string;
  error?: string;
};

async function recoveryRequest(
  path: string,
  payload: Record<string, string>,
): Promise<string> {
  if (!customAuthEnabled) {
    throw new Error(
      'Password recovery is not available for this authentication provider.',
    );
  }

  const response = await fetch(
    `${AUTH_API_BASE}${path}`,
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  const data: RecoveryResponse =
    await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : 'Unable to complete the request. Please try again.',
    );
  }

  return typeof data.message === 'string'
    ? data.message
    : 'Request completed successfully.';
}

export function requestPasswordReset(
  email: string,
): Promise<string> {
  return recoveryRequest(
    '/forgot-password',
    { email },
  );
}

export function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<string> {
  return recoveryRequest(
    '/reset-password',
    {
      token,
      newPassword,
    },
  );
}

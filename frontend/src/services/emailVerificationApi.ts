
import {
  AUTH_API_BASE,
} from './authConfig';

type ApiResponse = {
  message?: string;
  error?: string;
};

async function postVerificationRequest(
  path: string,
  payload: Record<string, string>,
): Promise<string> {
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

  const data: ApiResponse =
    await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : 'Request failed. Please try again.',
    );
  }

  return (
    typeof data.message === 'string'
      ? data.message
      : 'Request completed successfully.'
  );
}

export async function verifyEmailToken(
  token: string,
): Promise<string> {
  return postVerificationRequest(
    '/verify-email',
    { token },
  );
}

export async function requestVerificationResend(
  email: string,
): Promise<string> {
  return postVerificationRequest(
    '/resend-verification',
    { email },
  );
}


import 'dotenv/config';

import nodemailer from 'nodemailer';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function createMailTransport() {
  const host = getRequiredEnv('SMTP_HOST');
  const username = getRequiredEnv('SMTP_USER');
  const password = getRequiredEnv('SMTP_PASSWORD');

  const port = Number(
    process.env.SMTP_PORT ?? '587',
  );

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('Invalid SMTP_PORT');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,

    // Require STARTTLS on non-implicit TLS ports.
    requireTLS: port !== 465,

    auth: {
      user: username,
      pass: password,
    },

    tls: {
      rejectUnauthorized: true,
    },

    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

let transport:
  ReturnType<typeof createMailTransport> | null = null;

function getTransport() {
  if (!transport) {
    transport = createMailTransport();
  }

  return transport;
}

export async function verifyMailConnection():
  Promise<void> {
  await getTransport().verify();
}

export async function sendTransactionalEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<void> {
  const from = getRequiredEnv('SMTP_FROM');

  await getTransport().sendMail({
    from,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
}

export function closeMailConnection(): void {
  transport?.close();
  transport = null;
}

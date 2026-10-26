import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env');
}

const frontendUrl = (
  process.env.FRONTEND_URL ?? 'http://localhost:5173'
).replace(/\/$/, '');
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const app = express();

app.use(cors({ origin: frontendUrl }));
app.use(express.json({ limit: '10kb' }));

app.post('/api/forgot-password/request', async (req, res) => {
  const email = req.body?.email;

  if (
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${frontendUrl}/forgot-password.html`,
      },
    );

    if (error) {
      console.error('Password reset email request failed:', error.message);
      res.status(503).json({
        error: 'Could not send the reset email. Please try again later.',
      });
      return;
    }

    res.status(202).json({
      message: 'If the account exists, a reset link will be sent.',
    });
  } catch (error) {
    console.error('Password reset email request failed:', error);
    res.status(503).json({
      error: 'Could not send the reset email. Please try again later.',
    });
  }
});

app.post('/api/forgot-password/update', async (req, res) => {
  const { accessToken, password } = req.body ?? {};

  if (
    typeof accessToken !== 'string' ||
    !accessToken ||
    typeof password !== 'string' ||
    password.length < 8
  ) {
    res.status(400).json({
      error: 'A valid reset token and password of at least 8 characters are required.',
    });
    return;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      res.status(400).json({
        error: 'The reset link is invalid or expired. Request a new one.',
      });
      return;
    }

    res.status(200).json({ message: 'Your password has been updated.' });
  } catch (error) {
    console.error('Password update failed:', error);
    res.status(503).json({
      error: 'Could not update your password. Please try again later.',
    });
  }
});

const port = Number(process.env.PASSWORD_RESET_PORT ?? 5001);
app.listen(port, () => {
  console.log(`Password reset service listening on port ${port}`);
});

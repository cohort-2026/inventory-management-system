import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
}

const authOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

// Stateless server-side Supabase Auth client; never exposes the service key.
export const supabaseAuth = createClient(url, publishableKey, authOptions);

// Privileged profile lookup only; never send this client or key to the browser.
export const supabaseAdmin = createClient(url, serviceRoleKey, authOptions);
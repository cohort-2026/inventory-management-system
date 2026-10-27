import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const ca = readFileSync(
  resolve(process.cwd(), 'certs', 'prod-ca-2021.crt'),
  'utf8'
);

export const dbPool = new Pool({
  connectionString,
  ssl: {
    ca,
    rejectUnauthorized: true,
  },
  connectionTimeoutMillis: 10000,
});
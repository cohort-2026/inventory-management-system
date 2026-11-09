
import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

// Vercel: read the certificate from an environment variable.
// Local development: use the existing certificate file.
const environmentCertificate = process.env.DATABASE_CA_CERT;

const ca = environmentCertificate
  ? environmentCertificate.replace(/\\n/g, '\n')
  : readFileSync(
      resolve(process.cwd(), 'certs', 'prod-ca-2021.crt'),
      'utf8',
    );

export const dbPool = new Pool({
  connectionString,
  ssl: {
    ca,
    rejectUnauthorized: true,
  },
  max: 5,
  connectionTimeoutMillis: 10000,
});

import dotenv from 'dotenv';
dotenv.config();

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
    throw new Error(
        'JWT_SECRET is not set. Add it to your .env file. (see .env.example) before starting the server.'
    );
}

export const JWT_SECRET: string = jwtSecret;
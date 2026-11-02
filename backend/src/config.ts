import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error(
        'JWT_SECRET is not set. Add it to your .env file. (see .env.example) before starting the server.'
    );
}

export { JWT_SECRET };
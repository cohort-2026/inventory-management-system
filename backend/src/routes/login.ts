import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { requireAuth } from '../middleware/requireAuth';

const router = express.Router();

const FAKE_USER = {
        username: 'admin',
        password: '$2b$10$Aj37q1FLEdFvD60I3v2OJeWI/vVCq6cTBnLvGLJmlNAJWatGT4MmG'
    }

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (username !== FAKE_USER.username) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const isMatch = await bcrypt.compare(password, FAKE_USER.password)
    if (!isMatch){
        return res.status(401).json({ error: 'Invalid username or password' })
    }

    const token = jwt.sign({ username }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '1d'});

    res.cookie('token', token, {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
    })

    res.json({ message: 'Login successful' });
});

router.get('/me', requireAuth, (req, res) => {
    res.json({ user: (req as any).user });
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

export default router;

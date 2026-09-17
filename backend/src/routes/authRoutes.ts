import express from 'express';
import *as auth from '../controller/authController';

const router = express.Router();

router.post('/register', (auth as any).register);
router.post('/login', (auth as any).login);
router.post('/forgot-password', (auth as any).forgotPassword);
router.post('/reset-password/:token',(auth as any).resetPassword);

export default router;
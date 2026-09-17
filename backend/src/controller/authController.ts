import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { sql } from '../config/db';

export const register = async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, email, password } = req.body;
    const existing: any = await sql`SELECT user_id FROM users WHERE email=${email}`;
    if(existing.length) return res.status(400).json({error:'Email exists'});
    const hash = await bcrypt.hash(password, 10);
    const role: any = await sql`SELECT role_id FROM roles WHERE name='Manager' LIMIT 1`;
    if(!role.length) return res.status(500).json({error:'Roles not seeded'});
    const newUser: any = await sql`
      INSERT INTO users (role_id, first_name, last_name, email, password)
      VALUES (${role[0].role_id}, ${first_name}, ${last_name}, ${email}, ${hash})
      RETURNING user_id, email, first_name
    `;
    res.status(201).json(newUser[0]);
  } catch(e:any){
    console.log(e);
    res.status(500).json({error:e.message});
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const users: any = await sql`SELECT * FROM users WHERE email=${email}`;
    if(!users.length) return res.status(401).json({error:'Invalid credentials'});
    const ok = await bcrypt.compare(password, users[0].password);
    if(!ok) return res.status(401).json({error:'Invalid credentials'});
    const token = jwt.sign({ user_id: users[0].user_id, role_id: users[0].role_id }, process.env.JWT_SECRET!, {expiresIn:'1d'});
    res.json({ token, user: { user_id: users[0].user_id, email: users[0].email, first_name: users[0].first_name } });
  } catch(e:any){ res.status(500).json({error:e.message}); }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const users: any = await sql`SELECT user_id FROM users WHERE email=${email}`;
    if(!users.length) return res.status(404).json({error:'Email not found'});
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour
    await sql`UPDATE users SET reset_token=${token}, reset_token_expires=${expires} WHERE email=${email}`;
    const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${token}`;
    console.log('🔗 RESET LINK:', link);
    res.json({ message:'Reset link generated - check backend terminal', link });
  } catch(e:any){
    console.log(e);
    res.status(500).json({error:e.message});
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const users: any = await sql`SELECT user_id, reset_token_expires FROM users WHERE reset_token=${token}`;
    if(!users.length) return res.status(400).json({error:'Invalid token'});
    if(new Date(users[0].reset_token_expires) < new Date()) return res.status(400).json({error:'Token expired'});
    const hash = await bcrypt.hash(password, 10);
    await sql`UPDATE users SET password=${hash}, reset_token=NULL, reset_token_expires=NULL WHERE user_id=${users[0].user_id}`;
    res.json({ message:'Password reset success - you can login now' });
  } catch(e:any){ res.status(500).json({error:e.message}); }
};
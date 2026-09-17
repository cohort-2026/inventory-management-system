import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:5000/api/auth/forgot-password', { email });
      setMsg('Reset link: ' + res.data.link + ' (also check backend terminal)');
      console.log('RESET LINK:', res.data.link);
    } catch (err: any) {
      console.log(err);
      setMsg(err.response?.data?.error || 'Error - email not found?');
    }
  };

  return (
    <div className="auth-container">
      <h2>Forgot your password?</h2>
      <div className="auth-card">
        <div className="auth-card-top">
          <div className="auth-desc">
            Enter your email address and we'll send you a link to reset your password.
          </div>
        </div>
        <hr className="auth-divider" />
        <form onSubmit={handleSubmit}>
          <label className="auth-label">Email Adress</label>
          <input
            className="auth-input"
            placeholder="e.g. email@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="auth-button" type="submit">Reset Password</button>
          {msg && <p style={{fontSize:'13px', marginTop:'10px', textAlign:'center'}}>{msg}</p>}
        </form>
      </div>
      <div className="auth-card-footer">
        <span>Don't have an account?</span>
        <Link to="/register" className="auth-footer-btn">Sign Up</Link>
      </div>
    </div>
  );
}
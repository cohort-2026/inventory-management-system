import { useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Auth.css';

export default function ResetPassword(){
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if(password !== confirm) return setMsg('Passwords do not match');
    try{
      const res = await axios.post(`http://localhost:5000/api/auth/reset-password/${token}`, { password });
      setMsg(res.data.message + ' - Redirecting...');
      setTimeout(()=> navigate('/login'), 2000);
    }catch(err:any){
      setMsg(err.response?.data?.error || 'Error');
    }
  };

  return(
    <div className="auth-container">
      <div className="auth-card">
        <h2>Reset Password</h2>
        <form onSubmit={handleSubmit}>

          <div style={{position:'relative'}}>
            <input className="auth-input" type={show1 ? 'text' : 'password'} placeholder="New password" value={password} onChange={e=>setPassword(e.target.value)} />
            <span onClick={()=>setShow1(!show1)} style={{position:'absolute', right:'10px', top:'10px', cursor:'pointer'}}>{show1 ? '🙈' : '👁️'}</span>
          </div>

          <div style={{position:'relative', marginTop:'10px'}}>
            <input className="auth-input" type={show2 ? 'text' : 'password'} placeholder="Confirm password" value={confirm} onChange={e=>setConfirm(e.target.value)} />
            <span onClick={()=>setShow2(!show2)} style={{position:'absolute', right:'10px', top:'10px', cursor:'pointer'}}>{show2 ? '🙈' : '👁️'}</span>
          </div>

          <button className="auth-button" type="submit" style={{marginTop:'15px'}}>Reset Password</button>
          {msg && <p style={{fontSize:'13px', textAlign:'center', marginTop:'10px', color: msg.includes('Error') || msg.includes('match') ? 'red' : 'green'}}>{msg}</p>}
        </form>
      </div>
    </div>
  )
}

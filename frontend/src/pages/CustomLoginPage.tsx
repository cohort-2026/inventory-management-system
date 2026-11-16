
import { useNavigate } from 'react-router-dom';

import LoginScreen from './Login';

import {
  useAuth,
} from '../utils/AuthContext';

export default function CustomLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleLogin(
    email: string,
    password: string,
  ): Promise<void> {
    await login(email, password);

    navigate('/inventory', {
      replace: true,
    });
  }

  return (
    <LoginScreen
      onSubmit={handleLogin}
    />
  );
}

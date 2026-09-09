import { useNavigate } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
 
export default function LogoutButton() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
 
  async function handleLogout() {
    await logout();
    navigate("/login");
  }
 
  if (!user) return null;
 
  return <button onClick={handleLogout}>Log out</button>;
}
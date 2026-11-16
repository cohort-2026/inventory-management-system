import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../utils/AuthContext";

export default function LogoutButton() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  if (!user) return null;

  return (
    <button
      className="logout-button"
      type="button"
      onClick={handleLogout}
    >
      <LogOut size={16} />
      <span>Log out</span>
    </button>
  );
}
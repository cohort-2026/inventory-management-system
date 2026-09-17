import { Navigate } from "react-router-dom"

function ProtectedRoutes({ children }) {
  const token = localStorage.getItem('token')
  
  if (!token) {
    return <Navigate to="/login" />  // Go to login, NOT home
  }
  
  return children
}

export default ProtectedRoutes
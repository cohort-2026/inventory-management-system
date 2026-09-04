import Navbar from "../components/NavBar";

export default function Login() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <Navbar/>
      <h1>Inventory Management System</h1>
      <p>Welcome to the Login page!</p>

      {/* Input username and Password */}

      {/* If (username == true && password == true) {
      <Link to="/dashboard">Go to Dashboard</Link>
      } */}
    </div>
  );
}
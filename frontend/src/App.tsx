import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import CreateProduct from './pages/CreateProduct';

function App() {

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<NotFound />} />
        <Route path="/createproduct" element={<CreateProduct />} />
      
      </Routes>
    </BrowserRouter>
  )
}

export default App;
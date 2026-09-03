import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import CreateProduct from './pages/CreateProduct';
import AdjustStock from './pages/AdjustStock';
import TransferStock from './pages/TransferStock'

function App() {

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
        <Route path="/adjust_stock" element={<AdjustStock />} />
        <Route path="/transfer_stock" element={<TransferStock />} />
        <Route path="/createproduct" element={<CreateProduct />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App;
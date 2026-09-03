import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
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
      </Routes>
    </BrowserRouter>
  )
}

export default App;
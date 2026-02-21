import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Training from './pages/Training'
import Profile from './pages/Profile'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/training" element={<Training />} />
      <Route path="/profile" element={<Profile />} />
    </Routes>
  )
}

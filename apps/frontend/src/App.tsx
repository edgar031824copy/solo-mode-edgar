import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CandidateDetailPage from './pages/CandidateDetailPage'

// Shell rendered for all protected routes — includes top nav
function ProtectedShell() {
  return (
    <>
      <Navbar />
      <ProtectedRoute />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/candidates/:id" element={<CandidateDetailPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

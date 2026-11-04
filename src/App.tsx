import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import Index from './pages/Index'
import { Login } from './pages/Login'
import { EstudoCenario } from './pages/EstudoCenario'
import { PaginaTestes } from './pages/PaginaTestes'
import NotFound from './pages/NotFound'
import { AdminPage } from './pages/Admin'
import Layout from './components/Layout'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner richColors position="top-right" />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/testes" element={<PaginaTestes />} />
            <Route path="/estudo/:estudoId/cenario/:cenarioId" element={<EstudoCenario />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App

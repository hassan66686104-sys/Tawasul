import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import { ConfirmHost, FullLoader, ToastHost } from './components/ui'
import Home from './pages/Home'
import Setup from './pages/Setup'

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const TeacherRoom = lazy(() => import('./pages/TeacherRoom'))
const ExportPrint = lazy(() => import('./pages/ExportPrint'))
const StudentRoom = lazy(() => import('./pages/StudentRoom'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))

function RequireTeacher({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth()
  if (loading) return <FullLoader />
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  if (!isConfigured) return <Setup />
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <Suspense fallback={<FullLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route path="/t" element={<RequireTeacher><Dashboard /></RequireTeacher>} />
            <Route path="/t/c/:id" element={<RequireTeacher><TeacherRoom /></RequireTeacher>} />
            <Route path="/t/c/:id/export" element={<RequireTeacher><ExportPrint /></RequireTeacher>} />
            <Route path="/j/:slug" element={<StudentRoom />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <ToastHost />
      <ConfirmHost />
    </AuthProvider>
  )
}

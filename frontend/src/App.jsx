import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Navbar from './components/Shared/Navbar'
import PipelinePage from './pages/PipelinePage'
import OutreachPage from './pages/OutreachPage'
import CallCenterPage from './pages/CallCenterPage'
import CallAnalyticsPage from './pages/CallAnalyticsPage'
import CalendarPage from './pages/CalendarPage'
import EmailHubPage from './pages/EmailHubPage'
import ScraperPage from './pages/ScraperPage'
import SettingsPage from './pages/SettingsPage'
import LoginPage from './pages/LoginPage'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-body)',
        fontSize: '14px',
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppLayout() {
  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<PipelinePage />} />
          <Route path="/outreach" element={<OutreachPage />} />
          <Route path="/calls" element={<CallCenterPage />} />
          <Route path="/analytics" element={<CallAnalyticsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/emails" element={<EmailHubPage />} />
          <Route path="/scraper" element={
            <ProtectedRoute adminOnly>
              <ScraperPage />
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute adminOnly>
              <SettingsPage />
            </ProtectedRoute>
          } />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  )
}

export default App

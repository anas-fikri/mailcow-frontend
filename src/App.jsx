import React, { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppLayout from './components/layout/AppLayout'
import { useAuthStore } from './store/authStore'
import { onSessionExpired, resetSessionExpiredFlag, revokeSmtpSession } from './lib/api'
import ToastContainer from './components/Toast'
import { toast } from './lib/toast'
import ErrorBoundary from './components/ErrorBoundary'

// ─── Code Splitting: lazy load pages ─────────────────────────────────────────
const LoginPage = lazy(() => import('./pages/LoginPage'))
const MailPage = lazy(() => import('./pages/MailPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const ContactsPage = lazy(() => import('./pages/ContactsPage'))
const PreferencesPage = lazy(() => import('./pages/PreferencesPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const RulesPage = lazy(() => import('./pages/RulesPage'))

// ─── Page Loading Fallback ───────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full w-full bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Memuat...</span>
      </div>
    </div>
  )
}

// ─── QueryClient ──────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failCount, error) => {
        const status = error?.status || error?.cause?.status
        if (status === 401 || status === 403 || status === 404) return false
        return failCount < 2
      },
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 10000),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

// ─── Session Watcher ─────────────────────────────────────────────────────────
function SessionWatcher({ children }) {
  const { clearUser, isLoggedIn } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    onSessionExpired(() => {
      const smtpToken = useAuthStore.getState().smtpToken
      revokeSmtpSession(smtpToken)
      queryClient.clear()
      clearUser()
      resetSessionExpiredFlag() // reset agar bisa trigger lagi di session berikutnya
      toast.error('Sesi berakhir. Silakan login ulang.')
      navigate('/login', { replace: true })
    })
  }, [clearUser, navigate])

  return children
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/webmail">
        <ErrorBoundary>
          <SessionWatcher>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<AppLayout />}>
                  <Route index element={<Navigate to="/mail" replace />} />
                  <Route path="/mail" element={<MailPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/contacts" element={<ContactsPage />} />
                  <Route path="/settings" element={<PreferencesPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/rules" element={<RulesPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/mail" replace />} />
              </Routes>
            </Suspense>
            <ToastContainer />
          </SessionWatcher>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

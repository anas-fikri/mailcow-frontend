import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import MailPage from './pages/MailPage'
import CalendarPage from './pages/CalendarPage'
import ContactsPage from './pages/ContactsPage'
import PreferencesPage from './pages/PreferencesPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/webmail">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/mail" replace />} />
            <Route path="/mail" element={<MailPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/settings" element={<PreferencesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/mail" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

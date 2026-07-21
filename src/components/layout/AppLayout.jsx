import React, { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { useAuthStore } from '../../store/authStore';

export default function AppLayout() {
  const { isLoggedIn, theme } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = React.useState(false); // Mobile sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false); // Desktop sidebar state
  
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [theme]);

  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground transition-colors duration-200">
      
      {/* Mobile Sidebar Overlay */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 md:hidden ${sidebarOpen ? 'block' : 'hidden'}`} 
        onClick={() => setSidebarOpen(false)} 
      />

      {/* Main Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform md:relative md:translate-x-0 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'md:w-16' : 'md:w-56'} flex shrink-0`}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} onClose={() => setSidebarOpen(false)} />
      </div>

      <main className="flex-1 overflow-hidden relative pb-16 md:pb-0 flex flex-col min-w-0">
        {/* Mobile Header for Sidebar Toggle (if needed globally, otherwise pages handle it) */}
        <Outlet context={{ setSidebarOpen }} />
      </main>
      <BottomNav />
    </div>
  );
}

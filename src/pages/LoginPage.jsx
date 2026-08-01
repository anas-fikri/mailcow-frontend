import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Eye, EyeOff, Loader2, AlertCircle, Sun, Moon } from 'lucide-react';
import { login, resetSessionExpiredFlag } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { isLoggedIn, setUser, setSmtpCreds, clearUser, theme, toggleTheme } = useAuthStore();
  const navigate = useNavigate();
  const emailRef = useRef(null);

  useEffect(() => {
    if (isLoggedIn) {
      navigate('/mail', { replace: true });
    }
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    if (!isLoggedIn && emailRef.current) {
      emailRef.current.focus();
    }
  }, [isLoggedIn]);

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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Clear stale persisted user sebelum login baru
      clearUser();
      resetSessionExpiredFlag();
      const data = await login(userName, password);
      // login returns { sogoToken, cn, email }
      setUser({ email: data.email, sogoToken: data.sogoToken, cn: data.cn });
      // Simpan SMTP creds di memory (tidak dipersist) untuk fallback send
      setSmtpCreds({ user: userName, pass: password });
      navigate('/mail');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center bg-background text-foreground md:bg-muted/40 p-4 sm:p-8 relative transition-colors duration-200">
      
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm mx-auto flex flex-col"
      >
        {/* Mobile First Header */}
        <div className="flex flex-col items-center mb-8 gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <Mail size={24} className="text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">PCP Express Mail</h1>
            <p className="text-sm text-muted-foreground mt-1">Masuk ke webmail korporat</p>
          </div>
        </div>

        {/* Shadcn Card Style */}
        <div className="bg-card text-card-foreground md:border md:shadow-sm rounded-xl p-0 md:p-6 transition-colors">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Email */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium leading-none">
                Alamat Email
              </label>
              <input
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder="nama@domain.com"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium leading-none">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm font-medium border border-destructive/20 overflow-hidden"
                >
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Memproses...
                </>
              ) : (
                'Masuk'
              )}
            </button>
          </form>
        </div>
        
        <p className="text-center text-xs text-muted-foreground mt-8">
          © {new Date().getFullYear()} PCP Express. SOGo Mailcow Engine.
        </p>
      </motion.div>
    </div>
  );
}

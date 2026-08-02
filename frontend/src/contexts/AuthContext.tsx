import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi } from '../services/authApi';
import type { AuthResponse } from '../types/api';

interface AuthContextValue {
  user: { user_id: number; username: string } | null;
  token: string | null;
  login: (username: string, password: string) => Promise<AuthResponse>;
  register: (username: string, password: string) => Promise<AuthResponse>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ user_id: number; username: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化时从 localStorage 恢复
  useEffect(() => {
    const savedToken = localStorage.getItem('fintracker_token');
    const savedUser = localStorage.getItem('fintracker_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('fintracker_token');
        localStorage.removeItem('fintracker_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    const res = await authApi.login({ username, password });
    setUser({ user_id: res.user_id, username: res.username });
    setToken(res.token);
    localStorage.setItem('fintracker_token', res.token);
    localStorage.setItem('fintracker_user', JSON.stringify({ user_id: res.user_id, username: res.username }));
    return res;
  };

  const register = async (username: string, password: string) => {
    const res = await authApi.register({ username, password });
    setUser({ user_id: res.user_id, username: res.username });
    setToken(res.token);
    localStorage.setItem('fintracker_token', res.token);
    localStorage.setItem('fintracker_user', JSON.stringify({ user_id: res.user_id, username: res.username }));
    return res;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('fintracker_token');
    localStorage.removeItem('fintracker_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

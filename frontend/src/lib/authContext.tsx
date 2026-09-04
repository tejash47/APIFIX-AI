'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId?: string;
  role?: string;
  credits?: number;
  plan?: string;
  subscriptionStatus?: string;
  stripeCustomerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  activeWorkspaceRole: string;
  isAdmin: boolean;
  isDemoUser: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  register: (email: string, pass: string, name: string) => Promise<boolean>;
  logout: () => void;
  setActiveWorkspaceId: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
  isLoading: boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  workspaces: [],
  activeWorkspace: null,
  activeWorkspaceRole: 'MEMBER',
  isAdmin: false,
  isDemoUser: false,
  login: async () => false,
  register: async () => false,
  logout: () => {},
  setActiveWorkspaceId: () => {},
  refreshWorkspaces: async () => {},
  isLoading: true
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWorkspacesList = async (authToken: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/workspaces`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.workspaces || [];
        setWorkspaces(list);
        if (list.length > 0) {
          const savedWsId = typeof window !== 'undefined' ? localStorage.getItem('apifix_active_ws') : null;
          const match = list.find((w: Workspace) => w.id === savedWsId) || list[0];
          setActiveWorkspaceIdState(match.id);
        }
      }
    } catch (e) {
      console.warn('Failed to load user workspaces:', e);
    }
  };

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const savedToken = localStorage.getItem('apifix_token');
        const savedUser = localStorage.getItem('apifix_user');

        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          fetchWorkspacesList(savedToken);
        } else {
          setUser(null);
          setToken(null);
          setWorkspaces([]);
        }
      }
    } catch (e) {
      console.error('Failed loading saved auth:', e);
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('apifix_active_ws', id);
    }
  };

  const refreshWorkspaces = async () => {
    if (token) {
      await fetchWorkspacesList(token);
    }
  };

  const login = async (email: string, pass: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('apifix_signed_out');
          localStorage.setItem('apifix_token', data.token);
          localStorage.setItem('apifix_user', JSON.stringify(data.user));
        }
        if (data.workspaces && data.workspaces.length > 0) {
          setWorkspaces(data.workspaces);
          setActiveWorkspaceId(data.workspaces[0].id);
        } else {
          await fetchWorkspacesList(data.token);
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('Login request failed:', err);
      return false;
    }
  };

  const register = async (email: string, pass: string, name: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, name })
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('apifix_signed_out');
          localStorage.setItem('apifix_token', data.token);
          localStorage.setItem('apifix_user', JSON.stringify(data.user));
        }
        if (data.defaultWorkspace) {
          setWorkspaces([data.defaultWorkspace]);
          setActiveWorkspaceId(data.defaultWorkspace.id);
        } else {
          await fetchWorkspacesList(data.token);
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('Register request failed:', err);
      return false;
    }
  };

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('apifix_signed_out', 'true');
      localStorage.removeItem('apifix_token');
      localStorage.removeItem('apifix_user');
      localStorage.removeItem('apifix_active_ws');
    }
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceIdState(null);
  };

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0] || null;
  const activeWorkspaceRole = activeWorkspace?.role || (user?.role === 'admin' ? 'OWNER' : 'MEMBER');

  const isAdmin = Boolean(
    user && (
      user.role === 'admin' ||
      user.email?.toLowerCase() === 'admin@apifix.ai'
    )
  );

  const isDemoUser = isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        workspaces,
        activeWorkspace,
        activeWorkspaceRole,
        isAdmin,
        isDemoUser,
        login,
        register,
        logout,
        setActiveWorkspaceId,
        refreshWorkspaces,
        isLoading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

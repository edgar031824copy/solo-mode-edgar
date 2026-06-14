import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { jwtDecode } from 'jwt-decode'

interface Recruiter {
  id: string
  email: string
  name: string
}

interface AuthState {
  token: string | null
  recruiter: Recruiter | null
  isAuthenticated: boolean
}

interface AuthContextValue extends AuthState {
  login: (token: string, recruiter: Recruiter) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Decode stored token on init — returns null if token is missing or expired
function initFromStorage(): { token: string | null; recruiter: Recruiter | null } {
  const stored = localStorage.getItem('auth_token')
  if (!stored) return { token: null, recruiter: null }
  try {
    const payload = jwtDecode<{ sub: string; email: string; name: string; exp: number }>(stored)
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('auth_token')
      return { token: null, recruiter: null }
    }
    return {
      token: stored,
      recruiter: { id: payload.sub, email: payload.email, name: payload.name },
    }
  } catch {
    localStorage.removeItem('auth_token')
    return { token: null, recruiter: null }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const { token, recruiter } = initFromStorage()
    return { token, recruiter, isAuthenticated: token !== null }
  })

  // navigate is only available after Router wraps this provider — use a ref pattern
  // AuthProvider is rendered inside BrowserRouter so useNavigate is available here
  const navigate = useNavigate()

  const login = useCallback((token: string, recruiter: Recruiter) => {
    localStorage.setItem('auth_token', token)
    setState({ token, recruiter, isAuthenticated: true })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token')
    setState({ token: null, recruiter: null, isAuthenticated: false })
    navigate('/login')
  }, [navigate])

  // Re-hydrate if localStorage changes in another tab
  useEffect(() => {
    const handler = () => {
      const { token, recruiter } = initFromStorage()
      setState({ token, recruiter, isAuthenticated: token !== null })
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

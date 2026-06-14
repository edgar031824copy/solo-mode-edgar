import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import { AuthProvider } from '../context/AuthContext'

function renderWithAuth(token: string | null) {
  if (token) {
    localStorage.setItem('auth_token', token)
  } else {
    localStorage.removeItem('auth_token')
  }

  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

// A minimal valid JWT with future expiry — payload: { sub: '1', email: 'test@test.com', name: 'Test', exp: 9999999999 }
// Generated using HS256 with secret "test-secret" — valid structure but arbitrary signature for decode-only use
const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(JSON.stringify({ sub: '1', email: 'test@test.com', name: 'Test', exp: 9999999999 }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_') +
  '.fake_signature'

describe('ProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('redirects to /login when no token is present', () => {
    renderWithAuth(null)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders protected content when a valid token is present', () => {
    renderWithAuth(FAKE_JWT)
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })
})

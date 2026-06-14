import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../pages/LoginPage'
import { AuthProvider } from '../context/AuthContext'
import api from '../lib/api'

vi.mock('../lib/api', () => ({
  default: {
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

const mockApiPost = vi.mocked(api.post)

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders email and password inputs and a sign-in button', () => {
    renderLoginPage()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('renders the card title "Recruitment Platform"', () => {
    renderLoginPage()
    expect(screen.getByText('Recruitment Platform')).toBeInTheDocument()
  })

  it('calls POST /auth/login with email and password on submit', async () => {
    const user = userEvent.setup()
    mockApiPost.mockResolvedValueOnce({
      data: {
        token: 'fake.jwt.token',
        recruiter: { id: '1', email: 'recruiter@gorilla.com', name: 'Gorilla Recruiter' },
      },
    })
    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'recruiter@gorilla.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/auth/login',
        { email: 'recruiter@gorilla.com', password: 'password123' }
      )
    })
  })

  it('stores token in localStorage and navigates to / on successful login', async () => {
    const user = userEvent.setup()
    mockApiPost.mockResolvedValueOnce({
      data: {
        token: 'fake.jwt.token',
        recruiter: { id: '1', email: 'recruiter@gorilla.com', name: 'Gorilla Recruiter' },
      },
    })
    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'recruiter@gorilla.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('fake.jwt.token')
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('shows a destructive alert when login fails with 401', async () => {
    const user = userEvent.setup()
    mockApiPost.mockRejectedValueOnce({
      response: { data: { error: 'Invalid email or password' } },
    })
    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'bad@test.com')
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
    })
  })

  it('disables the button while the request is in-flight', async () => {
    const user = userEvent.setup()
    // promise that never resolves — simulates in-flight request
    mockApiPost.mockReturnValueOnce(new Promise(() => {}))
    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'recruiter@gorilla.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')

    const button = screen.getByRole('button', { name: /sign in/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(button).toBeDisabled()
    })
  })
})

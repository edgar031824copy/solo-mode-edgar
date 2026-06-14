import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'
import { AuthProvider } from '../context/AuthContext'
import api from '../lib/api'

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

const mockApiGet = vi.mocked(api.get)

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    </MemoryRouter>
  )
}

const mockCandidates = [
  {
    id: 'c1',
    name: 'Alice Smith',
    email: 'alice@example.com',
    position: 'Engineer',
    status: 'pending',
    cvFileName: 'cv-alice.pdf',
    linkedinFileName: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    recruiterChoice: null,
  },
  {
    id: 'c2',
    name: 'Bob Jones',
    email: null,
    position: null,
    status: 'decided',
    cvFileName: null,
    linkedinFileName: null,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    recruiterChoice: 'pass',
  },
]

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('auth_token', 'fake-token')
  })

  it('renders the page heading and New Candidate button', async () => {
    mockApiGet.mockResolvedValueOnce({ data: [] })
    renderDashboard()
    expect(screen.getByText('Candidates')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new candidate/i })).toBeInTheDocument()
  })

  it('fetches and displays candidates list', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidates })
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    })
  })

  it('shows Pass badge for decided candidate with recruiterChoice=pass', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidates })
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Pass')).toBeInTheDocument()
    })
  })

  it('shows status badge for pending candidate', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidates })
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  it('opens NewCandidateDialog when New Candidate is clicked', async () => {
    const user = userEvent.setup()
    mockApiGet.mockResolvedValueOnce({ data: [] })
    renderDashboard()

    await user.click(screen.getByRole('button', { name: /new candidate/i }))
    // dialog should appear — check for the Name field
    await waitFor(() => {
      expect(screen.getByLabelText(/^name/i)).toBeInTheDocument()
    })
  })

  it('calls GET /candidates on mount', async () => {
    mockApiGet.mockResolvedValueOnce({ data: [] })
    renderDashboard()

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/candidates')
    })
  })
})

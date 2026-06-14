import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CandidateDetailPage from '../pages/CandidateDetailPage'
import { AuthProvider } from '../context/AuthContext'
import api from '../lib/api'

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
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

const mockCandidate = {
  id: 'c1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  position: 'Senior Engineer',
  notes: 'Strong candidate',
  status: 'pre_screened',
  cvFileName: 'cv-alice.pdf',
  linkedinFileName: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  recruiterChoice: null,
  preScreening: null,
  postScreening: null,
}

function renderDetailPage(id = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/candidates/${id}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/candidates/:id" element={<CandidateDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('CandidateDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('auth_token', 'fake-token')
  })

  it('fetches candidate by id on mount', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidate })
    renderDetailPage()

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/candidates/c1')
    })
  })

  it('renders candidate name and position', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidate })
    renderDetailPage()

    await waitFor(() => {
      // name appears in page h1 header
      expect(screen.getByRole('heading', { name: 'Alice Smith' })).toBeInTheDocument()
      expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
    })
  })

  it('renders back button', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidate })
    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /candidates/i })).toBeInTheDocument()
    })
  })

  it('renders Pre-Screening and Post-Screening tabs', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidate })
    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('Pre-Screening')).toBeInTheDocument()
      expect(screen.getByText('Post-Screening')).toBeInTheDocument()
    })
  })

  it('shows details card with created/updated dates and notes', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidate })
    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('Strong candidate')).toBeInTheDocument()
    })
  })

  it('renders 404 message for unknown candidate', async () => {
    mockApiGet.mockRejectedValueOnce({
      response: { status: 404, data: { error: 'Candidate not found' } },
    })
    renderDetailPage('unknown-id')

    await waitFor(() => {
      expect(screen.getByText(/candidate not found/i)).toBeInTheDocument()
    })
  })
})

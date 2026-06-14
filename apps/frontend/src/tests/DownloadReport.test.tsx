import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CandidateDetailPage from '../pages/CandidateDetailPage'
import { AuthProvider } from '../context/AuthContext'
import api from '../lib/api'
import * as apiModule from '../lib/api'

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  downloadReport: vi.fn(),
}))

const mockApiGet = vi.mocked(api.get)
const mockDownloadReport = vi.mocked(apiModule.downloadReport)

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

const mockCandidate = {
  id: 'c1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  position: 'Senior Engineer',
  notes: null,
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

describe('Download Report button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('auth_token', 'fake-token')
    // Mock URL.createObjectURL and URL.revokeObjectURL — not available in jsdom
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).URL.revokeObjectURL = vi.fn()
  })

  it('renders a Download Report button', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidate })
    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download report/i })).toBeInTheDocument()
    })
  })

  it('calls downloadReport with the correct candidateId on click', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidate })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDownloadReport.mockResolvedValueOnce({ data: { candidate: mockCandidate, preScreening: null, postScreening: null } } as any)
    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download report/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /download report/i }))

    await waitFor(() => {
      expect(mockDownloadReport).toHaveBeenCalledWith('c1')
    })
  })

  it('disables the button while request is in-flight', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidate })
    // Never resolves — simulates in-flight
    mockDownloadReport.mockReturnValueOnce(new Promise(() => {}))
    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download report/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /download report/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download report/i })).toBeDisabled()
    })
  })

  it('shows an error alert when downloadReport fails', async () => {
    mockApiGet.mockResolvedValueOnce({ data: mockCandidate })
    mockDownloadReport.mockRejectedValueOnce(new Error('Network error'))
    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download report/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /download report/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })
})

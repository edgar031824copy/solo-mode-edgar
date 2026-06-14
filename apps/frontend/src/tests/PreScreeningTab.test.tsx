import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PreScreeningTab from '../components/PreScreeningTab'
import api from '../lib/api'
import type { CandidateDetail } from '../lib/types'

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

// Minimal candidate with no pre-screening data
const candidateIdle: CandidateDetail = {
  id: 'c1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  position: 'Senior Engineer',
  notes: null,
  status: 'pending',
  cvFileName: 'cv-alice.pdf',
  linkedinFileName: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  recruiterChoice: null,
  preScreeningError: null,
  preScreening: null,
  postScreening: null,
}

const preScreeningData = {
  id: 'ps1',
  profileSummary: 'Alice is an experienced engineer with 10 years of background in distributed systems. She is a strong fit for the Senior Engineer role.',
  redFlagsJson: JSON.stringify([
    {
      claim: 'Led a team of 50 engineers',
      source: 'cv',
      severity: 'medium',
      validationQuestion: 'Can you describe the structure of the team you led?',
    },
  ]),
  interviewQuestionsJson: JSON.stringify([
    { question: 'Tell me about your distributed systems work.', rationale: 'Core claim on CV', type: 'verification' },
    { question: 'How do you handle on-call incidents?', rationale: 'Key SRE requirement', type: 'verification' },
    { question: 'Describe a time you drove architectural change.', rationale: 'CV claim', type: 'verification' },
    { question: 'How do you approach mentoring junior engineers?', rationale: 'Senior role requirement', type: 'role-fit' },
    { question: 'What is your preferred leadership style?', rationale: 'Senior role requirement', type: 'role-fit' },
  ]),
  overallFit: 4,
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}

// Candidate that already has pre-screening results
const candidateDone: CandidateDetail = {
  ...candidateIdle,
  status: 'pre_screened',
  preScreening: preScreeningData,
}

function renderTab(candidate: CandidateDetail, onRefresh = vi.fn()) {
  return render(
    <MemoryRouter>
      <PreScreeningTab candidate={candidate} onRefresh={onRefresh} />
    </MemoryRouter>
  )
}

describe('PreScreeningTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('auth_token', 'fake-token')
  })

  it('renders idle state — "No pre-screening data yet." visible; button enabled', () => {
    renderTab(candidateIdle)
    expect(screen.getByText(/no pre-screening data yet/i)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /run pre-screening/i })
    expect(button).toBeInTheDocument()
    expect(button).not.toBeDisabled()
  })

  it('renders results state — profile summary, red flags, and 5 questions render', () => {
    renderTab(candidateDone)

    // Profile summary
    expect(screen.getByText(/alice is an experienced engineer/i)).toBeInTheDocument()
    // Red flag claim
    expect(screen.getByText(/led a team of 50 engineers/i)).toBeInTheDocument()
    // All 5 interview questions
    expect(screen.getByText(/tell me about your distributed systems work/i)).toBeInTheDocument()
    expect(screen.getByText(/how do you handle on-call incidents/i)).toBeInTheDocument()
    expect(screen.getByText(/describe a time you drove architectural change/i)).toBeInTheDocument()
    expect(screen.getByText(/how do you approach mentoring junior engineers/i)).toBeInTheDocument()
    expect(screen.getByText(/what is your preferred leadership style/i)).toBeInTheDocument()
  })

  it('re-run button — present in results state; clicking it triggers another API call', async () => {
    const user = userEvent.setup()
    // never-resolving to keep state visible
    mockApiPost.mockReturnValueOnce(new Promise(() => {}))
    renderTab(candidateDone)

    const rerunButton = screen.getByRole('button', { name: /re-run pre-screening/i })
    expect(rerunButton).toBeInTheDocument()

    await user.click(rerunButton)

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(`/candidates/${candidateDone.id}/pre-screen`)
    })
  })
})

describe('PreScreeningTab — polling behavior (F-29)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Spy on setInterval/clearInterval so we can verify interval management
    vi.spyOn(globalThis, 'setInterval')
    vi.spyOn(globalThis, 'clearInterval')
    localStorage.setItem('auth_token', 'fake-token')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('after 202 response, enters polling state and renders spinner + "Analyzing..."', async () => {
    const user = userEvent.setup()
    // Resolve immediately with 202 — backend job runs in background
    mockApiPost.mockResolvedValueOnce({ status: 202, data: { message: 'Pre-screening started' } })

    renderTab(candidateIdle)
    await user.click(screen.getByRole('button', { name: /run pre-screening/i }))

    await waitFor(() => {
      expect(screen.getByText(/analyzing\.\.\./i)).toBeInTheDocument()
    })

    // Interval must be started to poll for completion
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 3000)
  })

  it('when candidate.status transitions to pre_screened, polling stops and done state renders', async () => {
    const user = userEvent.setup()
    mockApiPost.mockResolvedValueOnce({ status: 202, data: { message: 'Pre-screening started' } })

    const onRefresh = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <PreScreeningTab candidate={candidateIdle} onRefresh={onRefresh} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: /run pre-screening/i }))

    // Wait for polling state
    await waitFor(() => {
      expect(screen.getByText(/analyzing\.\.\./i)).toBeInTheDocument()
    })

    // Simulate parent re-fetching and passing updated candidate with status pre_screened
    await act(async () => {
      rerender(
        <MemoryRouter>
          <PreScreeningTab candidate={candidateDone} onRefresh={onRefresh} />
        </MemoryRouter>
      )
    })

    await waitFor(() => {
      // Done state shows profile summary — polling stopped
      expect(screen.getByText(/alice is an experienced engineer/i)).toBeInTheDocument()
    })

    // Interval must be cleared when polling stops
    expect(clearInterval).toHaveBeenCalled()
  })

  it('when candidate.preScreeningError is set, polling stops and error message renders', async () => {
    const user = userEvent.setup()
    mockApiPost.mockResolvedValueOnce({ status: 202, data: { message: 'Pre-screening started' } })

    const onRefresh = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <PreScreeningTab candidate={candidateIdle} onRefresh={onRefresh} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: /run pre-screening/i }))

    await waitFor(() => {
      expect(screen.getByText(/analyzing\.\.\./i)).toBeInTheDocument()
    })

    // Simulate parent re-fetching and passing candidate with preScreeningError set
    const candidateWithError: CandidateDetail = {
      ...candidateIdle,
      preScreeningError: 'Claude API quota exceeded',
    }

    await act(async () => {
      rerender(
        <MemoryRouter>
          <PreScreeningTab candidate={candidateWithError} onRefresh={onRefresh} />
        </MemoryRouter>
      )
    })

    await waitFor(() => {
      expect(screen.getByText(/Claude API quota exceeded/i)).toBeInTheDocument()
    })

    // Interval must be cleared when error stops polling
    expect(clearInterval).toHaveBeenCalled()
  })

  it('clearInterval is called on unmount — no interval leak', async () => {
    const user = userEvent.setup()
    mockApiPost.mockResolvedValueOnce({ status: 202, data: { message: 'Pre-screening started' } })

    const { unmount } = renderTab(candidateIdle)
    await user.click(screen.getByRole('button', { name: /run pre-screening/i }))

    // Wait for polling to start
    await waitFor(() => {
      expect(screen.getByText(/analyzing\.\.\./i)).toBeInTheDocument()
    })

    // Unmounting while polling must clear the interval
    unmount()

    expect(clearInterval).toHaveBeenCalled()
  })
})

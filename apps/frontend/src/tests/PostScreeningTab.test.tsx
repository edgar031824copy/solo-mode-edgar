import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PostScreeningTab from '../components/PostScreeningTab'
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

// Candidate with no post-screening data
const candidateIdle: CandidateDetail = {
  id: 'c1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  position: 'Senior Engineer',
  notes: null,
  status: 'pre_screened',
  cvFileName: 'cv-alice.pdf',
  linkedinFileName: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  recruiterChoice: null,
  preScreeningError: null,
  preScreening: {
    id: 'ps1',
    profileSummary: 'Strong candidate.',
    redFlagsJson: JSON.stringify([{ claim: 'Led 50 engineers', source: 'cv', severity: 'medium', validationQuestion: 'Describe team structure.' }]),
    interviewQuestionsJson: JSON.stringify([{ question: 'Tell me about distributed systems.', rationale: 'CV claim', type: 'verification' }]),
    overallFit: 4,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  postScreening: null,
}

const reasoningJsonValue = JSON.stringify({
  reasoning: 'The candidate addressed all key red flags convincingly.',
  keyFindings: [
    { type: 'strength', description: 'Excellent distributed systems knowledge', relatedQuestion: 'Tell me about distributed systems.' },
    { type: 'concern', description: 'Unclear about team leadership scope', relatedQuestion: null },
    { type: 'unaddressed_flag', description: 'Did not clarify team size claim', relatedQuestion: 'Describe team structure.' },
  ],
  confidenceScore: 4,
})

// Candidate with post-screening done, no decision yet
const candidateUndecided: CandidateDetail = {
  ...candidateIdle,
  status: 'decided',
  postScreening: {
    id: 'post1',
    transcriptFileName: 'transcript.txt',
    aiRecommendation: 'pass',
    recruiterChoice: null,
    isOverride: null,
    reasoningJson: reasoningJsonValue,
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
  },
}

// Candidate with no_pass recommendation
const candidateUndecidedNoPass: CandidateDetail = {
  ...candidateUndecided,
  postScreening: {
    ...candidateUndecided.postScreening!,
    aiRecommendation: 'no_pass',
  },
}

// Candidate decided — confirmed (not an override)
const candidateDecidedConfirmed: CandidateDetail = {
  ...candidateUndecided,
  recruiterChoice: 'pass',
  postScreening: {
    ...candidateUndecided.postScreening!,
    recruiterChoice: 'pass',
    isOverride: false,
  },
}

// Candidate decided — overridden
const candidateDecidedOverridden: CandidateDetail = {
  ...candidateUndecided,
  recruiterChoice: 'no_pass',
  postScreening: {
    ...candidateUndecided.postScreening!,
    recruiterChoice: 'no_pass',
    isOverride: true,
  },
}

function renderTab(candidate: CandidateDetail, onRefresh = vi.fn()) {
  return render(
    <MemoryRouter>
      <PostScreeningTab candidate={candidate} onRefresh={onRefresh} />
    </MemoryRouter>
  )
}

// Helper to upload a transcript file in the file zone
async function uploadTranscript(user: ReturnType<typeof userEvent.setup>) {
  const fileInput = screen.getByTestId('file-input')
  const file = new File(['transcript content'], 'transcript.txt', { type: 'text/plain' })
  await user.upload(fileInput, file)
}

describe('PostScreeningTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('auth_token', 'fake-token')
  })

  it('renders idle state — "No post-screening data yet." visible; Run button disabled', () => {
    renderTab(candidateIdle)
    expect(screen.getByText(/no post-screening data yet/i)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /run post-screening/i })
    expect(button).toBeDisabled()
  })

  it('enables Run button after file is selected', async () => {
    const user = userEvent.setup()
    renderTab(candidateIdle)

    const fileInput = screen.getByTestId('file-input')
    const file = new File(['transcript content'], 'transcript.txt', { type: 'text/plain' })
    await user.upload(fileInput, file)

    const button = screen.getByRole('button', { name: /run post-screening/i })
    expect(button).not.toBeDisabled()
  })

  it('renders error state — on API error, destructive Alert; button re-enabled', async () => {
    const user = userEvent.setup()
    mockApiPost.mockRejectedValueOnce({
      response: { data: { error: 'Transcript file is required' } },
    })
    renderTab(candidateIdle)

    const fileInput = screen.getByTestId('file-input')
    const file = new File(['content'], 'transcript.txt', { type: 'text/plain' })
    await user.upload(fileInput, file)

    await user.click(screen.getByRole('button', { name: /run post-screening/i }))

    await waitFor(() => {
      expect(screen.getByText('Transcript file is required')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /run post-screening/i })).not.toBeDisabled()
    })
  })

  it('renders results state — pass: AI recommendation badge PASS visible; Confirm Pass and Override: No Pass buttons', () => {
    renderTab(candidateUndecided)

    expect(screen.getByText('PASS')).toBeInTheDocument()
    expect(screen.getByText(/the candidate addressed all key red flags/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm pass/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /override: no pass/i })).toBeInTheDocument()
  })

  it('renders results state — no_pass: Confirm No Pass and Override: Pass buttons visible', () => {
    renderTab(candidateUndecidedNoPass)

    expect(screen.getByText('NO PASS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm no pass/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /override: pass/i })).toBeInTheDocument()
  })

  it('renders decided state — confirmed: decided badge visible; "Confirmed by recruiter" label; no decision buttons', () => {
    renderTab(candidateDecidedConfirmed)

    expect(screen.getByText('Confirmed by recruiter')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm pass/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /override/i })).not.toBeInTheDocument()
  })

  it('renders decided state — overridden: "Overridden by recruiter" label visible', () => {
    renderTab(candidateDecidedOverridden)

    expect(screen.getByText('Overridden by recruiter')).toBeInTheDocument()
  })

  it('onRefresh called after decision button click — successful API response triggers onRefresh', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    mockApiPost.mockResolvedValueOnce({
      data: {
        ...candidateUndecided.postScreening,
        recruiterChoice: 'pass',
        isOverride: false,
      },
    })
    renderTab(candidateUndecided, onRefresh)

    await user.click(screen.getByRole('button', { name: /confirm pass/i }))

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })
  })
})

describe('PostScreeningTab — polling behavior (F-29)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'setInterval')
    vi.spyOn(globalThis, 'clearInterval')
    localStorage.setItem('auth_token', 'fake-token')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('after 202 response, enters polling state and renders spinner + "Analyzing..."', async () => {
    const user = userEvent.setup()
    mockApiPost.mockResolvedValueOnce({ status: 202, data: { message: 'Post-screening started' } })

    renderTab(candidateIdle)

    await uploadTranscript(user)
    await user.click(screen.getByRole('button', { name: /run post-screening/i }))

    await waitFor(() => {
      expect(screen.getByText(/analyzing\.\.\./i)).toBeInTheDocument()
    })

    // Interval must be started to poll for completion
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 3000)
  })

  it('when candidate.status transitions to decided, polling stops and done state renders', async () => {
    const user = userEvent.setup()
    mockApiPost.mockResolvedValueOnce({ status: 202, data: { message: 'Post-screening started' } })

    const onRefresh = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <PostScreeningTab candidate={candidateIdle} onRefresh={onRefresh} />
      </MemoryRouter>
    )

    await uploadTranscript(user)
    await user.click(screen.getByRole('button', { name: /run post-screening/i }))

    await waitFor(() => {
      expect(screen.getByText(/analyzing\.\.\./i)).toBeInTheDocument()
    })

    // Simulate parent re-fetching and passing updated candidate with aiRecommendation set
    await act(async () => {
      rerender(
        <MemoryRouter>
          <PostScreeningTab candidate={candidateUndecided} onRefresh={onRefresh} />
        </MemoryRouter>
      )
    })

    await waitFor(() => {
      // Done state shows AI recommendation
      expect(screen.getByText('PASS')).toBeInTheDocument()
    })

    // Interval must be cleared when polling stops
    expect(clearInterval).toHaveBeenCalled()
  })

  it('when candidate.preScreeningError is set, polling stops and error message renders', async () => {
    const user = userEvent.setup()
    mockApiPost.mockResolvedValueOnce({ status: 202, data: { message: 'Post-screening started' } })

    const onRefresh = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <PostScreeningTab candidate={candidateIdle} onRefresh={onRefresh} />
      </MemoryRouter>
    )

    await uploadTranscript(user)
    await user.click(screen.getByRole('button', { name: /run post-screening/i }))

    await waitFor(() => {
      expect(screen.getByText(/analyzing\.\.\./i)).toBeInTheDocument()
    })

    // Simulate parent re-fetching with error set
    const candidateWithError: CandidateDetail = {
      ...candidateIdle,
      preScreeningError: 'Post-screening Claude API error',
    }

    await act(async () => {
      rerender(
        <MemoryRouter>
          <PostScreeningTab candidate={candidateWithError} onRefresh={onRefresh} />
        </MemoryRouter>
      )
    })

    await waitFor(() => {
      expect(screen.getByText(/Post-screening Claude API error/i)).toBeInTheDocument()
    })

    // Interval must be cleared when error stops polling
    expect(clearInterval).toHaveBeenCalled()
  })

  it('clearInterval is called on unmount — no interval leak', async () => {
    const user = userEvent.setup()
    mockApiPost.mockResolvedValueOnce({ status: 202, data: { message: 'Post-screening started' } })

    const { unmount } = renderTab(candidateIdle)

    await uploadTranscript(user)
    await user.click(screen.getByRole('button', { name: /run post-screening/i }))

    // Wait for polling to start
    await waitFor(() => {
      expect(screen.getByText(/analyzing\.\.\./i)).toBeInTheDocument()
    })

    // Unmounting while polling must clear the interval
    unmount()

    expect(clearInterval).toHaveBeenCalled()
  })
})

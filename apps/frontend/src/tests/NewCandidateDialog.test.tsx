import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewCandidateDialog from '../components/NewCandidateDialog'
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

describe('NewCandidateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders form fields when open', () => {
    render(
      <NewCandidateDialog
        open={true}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create candidate/i })).toBeInTheDocument()
  })

  it('calls POST /candidates with form data on submit', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    const onOpenChange = vi.fn()
    mockApiPost.mockResolvedValueOnce({
      data: {
        id: 'new-id',
        name: 'Alice',
        status: 'pending',
      },
    })

    render(
      <NewCandidateDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />
    )

    await user.type(screen.getByLabelText(/name/i), 'Alice')
    await user.click(screen.getByRole('button', { name: /create candidate/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/candidates',
        expect.any(FormData),
        expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
      )
      expect(onCreated).toHaveBeenCalled()
    })
  })

  it('shows error alert when API call fails', async () => {
    const user = userEvent.setup()
    mockApiPost.mockRejectedValueOnce({
      response: { data: { error: 'Server error' } },
    })

    render(
      <NewCandidateDialog
        open={true}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText(/name/i), 'Alice')
    await user.click(screen.getByRole('button', { name: /create candidate/i }))

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument()
    })
  })
})

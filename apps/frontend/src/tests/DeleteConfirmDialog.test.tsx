import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DeleteConfirmDialog from '../components/DeleteConfirmDialog'
import api from '../lib/api'

vi.mock('../lib/api', () => ({
  default: {
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

const mockApiDelete = vi.mocked(api.delete)

describe('DeleteConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with candidate name when open', () => {
    render(
      <DeleteConfirmDialog
        candidateId="abc-123"
        candidateName="Jane Doe"
        open={true}
        onOpenChange={vi.fn()}
        onDeleted={vi.fn()}
      />
    )
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
  })

  it('calls DELETE /candidates/:id and onDeleted on confirm', async () => {
    const user = userEvent.setup()
    const onDeleted = vi.fn()
    const onOpenChange = vi.fn()
    mockApiDelete.mockResolvedValueOnce({ status: 204 })

    render(
      <DeleteConfirmDialog
        candidateId="abc-123"
        candidateName="Jane Doe"
        open={true}
        onOpenChange={onOpenChange}
        onDeleted={onDeleted}
      />
    )

    const confirmBtn = screen.getByRole('button', { name: /delete/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith('/candidates/abc-123')
      expect(onDeleted).toHaveBeenCalled()
    })
  })

  it('calls onOpenChange(false) on cancel', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <DeleteConfirmDialog
        candidateId="abc-123"
        candidateName="Jane Doe"
        open={true}
        onOpenChange={onOpenChange}
        onDeleted={vi.fn()}
      />
    )

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelBtn)

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})

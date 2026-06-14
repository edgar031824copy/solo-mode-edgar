import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CandidateStatusBadge from '../components/CandidateStatusBadge'

describe('CandidateStatusBadge', () => {
  it('renders "Pending" for pending status', () => {
    render(<CandidateStatusBadge status="pending" recruiterChoice={null} />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders "Pre-screened" for pre_screened status', () => {
    render(<CandidateStatusBadge status="pre_screened" recruiterChoice={null} />)
    expect(screen.getByText('Pre-screened')).toBeInTheDocument()
  })

  it('renders "Pass" badge (green) for decided + pass', () => {
    render(<CandidateStatusBadge status="decided" recruiterChoice="pass" />)
    const badge = screen.getByText('Pass')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toMatch(/bg-green-600/)
  })

  it('renders "No Pass" badge (destructive) for decided + no_pass', () => {
    render(<CandidateStatusBadge status="decided" recruiterChoice="no_pass" />)
    expect(screen.getByText('No Pass')).toBeInTheDocument()
  })

  it('renders "Decided" badge for decided + null recruiterChoice', () => {
    render(<CandidateStatusBadge status="decided" recruiterChoice={null} />)
    expect(screen.getByText('Decided')).toBeInTheDocument()
  })
})

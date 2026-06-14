import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FileDropZone from '../components/FileDropZone'

describe('FileDropZone', () => {
  it('renders label and default prompt text when no file selected', () => {
    render(
      <FileDropZone
        label="CV Upload"
        accept="application/pdf"
        onFile={vi.fn()}
      />
    )
    expect(screen.getByText('CV Upload')).toBeInTheDocument()
    expect(screen.getByText(/drop file here or click to browse/i)).toBeInTheDocument()
  })

  it('shows filename when fileName prop is set', () => {
    render(
      <FileDropZone
        label="CV Upload"
        accept="application/pdf"
        onFile={vi.fn()}
        fileName="resume.pdf"
      />
    )
    expect(screen.getByText('resume.pdf')).toBeInTheDocument()
  })

  it('calls onFile when a file is selected via input', () => {
    const onFile = vi.fn()
    render(
      <FileDropZone
        label="CV Upload"
        accept="application/pdf"
        onFile={onFile}
      />
    )
    const input = screen.getByTestId('file-input')
    const file = new File(['cv content'], 'cv.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('calls onFile when a file is dropped', () => {
    const onFile = vi.fn()
    render(
      <FileDropZone
        label="CV Upload"
        accept="application/pdf"
        onFile={onFile}
      />
    )
    const dropZone = screen.getByTestId('drop-zone')
    const file = new File(['cv content'], 'cv.pdf', { type: 'application/pdf' })
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    })
    expect(onFile).toHaveBeenCalledWith(file)
  })
})

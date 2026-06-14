import { useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import FileDropZone from './FileDropZone'
import api from '@/lib/api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export default function NewCandidateDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState('')
  const [notes, setNotes] = useState('')
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [linkedinFile, setLinkedinFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setEmail('')
    setPosition('')
    setNotes('')
    setCvFile(null)
    setLinkedinFile(null)
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      if (email.trim()) formData.append('email', email.trim())
      if (position.trim()) formData.append('position', position.trim())
      if (notes.trim()) formData.append('notes', notes.trim())
      if (cvFile) formData.append('cv', cvFile)
      if (linkedinFile) formData.append('linkedin', linkedinFile)

      await api.post('/candidates', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      reset()
      onOpenChange(false)
      onCreated()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to create candidate. Please try again.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) reset(); onOpenChange(isOpen) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Candidate</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="nc-name">Name *</Label>
            <Input
              id="nc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Full name"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="nc-email">Email</Label>
            <Input
              id="nc-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="nc-position">Position</Label>
            <Input
              id="nc-position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="nc-notes">Notes</Label>
            <Textarea
              id="nc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this candidate…"
              rows={3}
            />
          </div>

          <FileDropZone
            label="CV / Resume (PDF)"
            accept="application/pdf"
            onFile={setCvFile}
            fileName={cvFile?.name}
          />

          <FileDropZone
            label="LinkedIn Export (optional)"
            accept="application/pdf,text/plain"
            onFile={setLinkedinFile}
            fileName={linkedinFile?.name}
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { reset(); onOpenChange(false) }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Creating…' : 'Create Candidate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

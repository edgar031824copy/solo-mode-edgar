import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import api from '@/lib/api'

interface Props {
  candidateId: string
  candidateName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

export default function DeleteConfirmDialog({
  candidateId,
  candidateName,
  open,
  onOpenChange,
  onDeleted,
}: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await api.delete(`/candidates/${candidateId}`)
      onOpenChange(false)
      onDeleted()
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete candidate</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{candidateName}</strong>? This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

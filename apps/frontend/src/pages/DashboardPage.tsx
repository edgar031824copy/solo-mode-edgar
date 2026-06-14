import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import CandidateStatusBadge from '@/components/CandidateStatusBadge'
import NewCandidateDialog from '@/components/NewCandidateDialog'
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog'
import type { CandidateListItem } from '@/lib/types'
import api from '@/lib/api'
import { MoreHorizontal } from 'lucide-react'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString()
}

function truncate(str: string | null, max = 24): string {
  if (!str) return '—'
  return str.length > max ? str.slice(0, max) + '…' : str
}

export default function DashboardPage() {
  const [candidates, setCandidates] = useState<CandidateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  async function fetchCandidates() {
    try {
      const { data } = await api.get<CandidateListItem[]>('/candidates')
      setCandidates(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCandidates()
  }, [])

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Candidates</h1>
        <Button onClick={() => setNewDialogOpen(true)}>New Candidate</Button>
      </div>

      {/* Candidate table */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">No candidates yet. Add one to get started.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>CV</TableHead>
              <TableHead>LinkedIn</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    to={`/candidates/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>{c.position ?? '—'}</TableCell>
                <TableCell>
                  <CandidateStatusBadge
                    status={c.status}
                    recruiterChoice={c.recruiterChoice}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {truncate(c.cvFileName)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {truncate(c.linkedinFileName)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {formatDate(c.createdAt)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    } />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        render={<Link to={`/candidates/${c.id}`} />}
                      >
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* New Candidate dialog */}
      <NewCandidateDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onCreated={fetchCandidates}
      />

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          candidateId={deleteTarget.id}
          candidateName={deleteTarget.name}
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
          onDeleted={() => { setDeleteTarget(null); fetchCandidates() }}
        />
      )}
    </div>
  )
}

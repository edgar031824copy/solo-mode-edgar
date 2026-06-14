import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { CandidateDetail } from '@/lib/types'

interface Props {
  candidate: CandidateDetail
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString()
}

export default function CandidateDetailsCard({ candidate }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{candidate.name}</CardTitle>
        {candidate.position && (
          <CardDescription>{candidate.position}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground font-medium">Created</dt>
            <dd>{formatDate(candidate.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground font-medium">Updated</dt>
            <dd>{formatDate(candidate.updatedAt)}</dd>
          </div>

          <div>
            <dt className="text-muted-foreground font-medium">CV File</dt>
            <dd>
              {candidate.cvFileName ? (
                <a
                  href={`${import.meta.env.VITE_API_URL ?? ''}/candidates/${candidate.id}/files/cv`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  {candidate.cvFileName}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>

          <div>
            <dt className="text-muted-foreground font-medium">LinkedIn File</dt>
            <dd>
              {candidate.linkedinFileName ? (
                <a
                  href={`${import.meta.env.VITE_API_URL ?? ''}/candidates/${candidate.id}/files/linkedin`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  {candidate.linkedinFileName}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>

          {candidate.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground font-medium">Notes</dt>
              <dd className="mt-1 whitespace-pre-wrap">{candidate.notes}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}

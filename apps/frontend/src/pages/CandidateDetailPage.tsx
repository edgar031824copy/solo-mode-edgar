import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import CandidateDetailsCard from '@/components/CandidateDetailsCard'
import CandidateStatusBadge from '@/components/CandidateStatusBadge'
import PreScreeningTab from '@/components/PreScreeningTab'
import PostScreeningTab from '@/components/PostScreeningTab'
import type { CandidateDetail } from '@/lib/types'
import api, { downloadReport } from '@/lib/api'
import { ChevronLeft, Download, Loader2 } from 'lucide-react'

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  const handleDownloadReport = async () => {
    if (!id) return
    setReportLoading(true)
    setReportError(null)
    try {
      const { data } = await downloadReport(id)
      // Client-driven download — backend returns JSON, we construct the Blob here
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `candidate-${id}-report.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ??
        (err as { message?: string })?.message ??
        'Failed to download report.'
      setReportError(message)
      // Auto-dismiss error after 5 seconds
      setTimeout(() => setReportError(null), 5000)
    } finally {
      setReportLoading(false)
    }
  }

  const fetchCandidate = (silent = false): void => {
    if (!id) return
    if (!silent) setLoading(true)
    api
      .get<CandidateDetail>(`/candidates/${id}`)
      .then(({ data }) => setCandidate(data))
      .catch((err: unknown) => {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Failed to load candidate.'
        setError(message)
      })
      .finally(() => { if (!silent) setLoading(false) })
  }

  useEffect(() => {
    fetchCandidate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !candidate) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Candidates
        </Button>
        <p className="mt-4 text-destructive">{error ?? 'Candidate not found.'}</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      {/* Header row */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Candidates
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-2xl font-semibold">{candidate.name}</h1>
          <CandidateStatusBadge
            status={candidate.status}
            recruiterChoice={candidate.recruiterChoice}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadReport}
          disabled={reportLoading}
        >
          {reportLoading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-1" />
          )}
          Download Report
        </Button>
      </div>

      {/* Report download error alert — auto-dismisses after 5 seconds */}
      {reportError && (
        <Alert variant="destructive">
          <AlertDescription>{reportError}</AlertDescription>
        </Alert>
      )}

      {/* Details card */}
      <CandidateDetailsCard candidate={candidate} />

      {/* Tab layout */}
      <Tabs defaultValue="pre-screening">
        <TabsList>
          <TabsTrigger value="pre-screening">Pre-Screening</TabsTrigger>
          <TabsTrigger value="post-screening">Post-Screening</TabsTrigger>
        </TabsList>

        <TabsContent value="pre-screening">
          <PreScreeningTab candidate={candidate} onRefresh={() => fetchCandidate(true)} />
        </TabsContent>

        <TabsContent value="post-screening">
          <PostScreeningTab candidate={candidate} onRefresh={() => fetchCandidate(true)} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

import { useState, useMemo, useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import api from '@/lib/api'
import type { CandidateDetail } from '@/lib/types'

interface Props {
  candidate: CandidateDetail
  onRefresh: () => void
}

// F-29: 'loading' replaced by 'polling' — POST returns 202, component polls GET every 3s
type ScreeningState = 'idle' | 'polling' | 'error' | 'done'

interface RedFlag {
  claim: string
  source: 'cv' | 'linkedin' | 'gap'
  severity: 'high' | 'medium' | 'low'
  validationQuestion: string
}

interface InterviewQuestion {
  question: string
  rationale: string
  type: 'verification' | 'role-fit'
}

export default function PreScreeningTab({ candidate, onRefresh }: Props) {
  const [screeningState, setScreeningState] = useState<ScreeningState>(
    candidate.preScreening ? 'done' : 'idle'
  )
  const [error, setError] = useState<string | null>(null)
  // local override populated after a successful run within this render session
  const [localResult, setLocalResult] = useState(candidate.preScreening)

  // useRef keeps interval handle stable across renders without causing re-renders
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  function startPolling() {
    pollingRef.current = setInterval(() => {
      onRefresh() // triggers parent re-fetch; result flows back via candidate prop
    }, 3000)
  }

  // Watch candidate prop changes for polling completion
  useEffect(() => {
    if (screeningState !== 'polling') return

    if (candidate.status === 'pre_screened' || candidate.preScreening != null) {
      stopPolling()
      setLocalResult(candidate.preScreening)
      setScreeningState('done')
    } else if (candidate.preScreeningError) {
      stopPolling()
      setError(candidate.preScreeningError)
      setScreeningState('error')
    }
  }, [candidate, screeningState])

  // Cleanup on unmount — prevents interval leak after navigating away
  useEffect(() => () => stopPolling(), [])

  const redFlags = useMemo<RedFlag[]>(() => {
    const json = localResult?.redFlagsJson
    if (!json) return []
    try {
      return JSON.parse(json) as RedFlag[]
    } catch {
      return []
    }
  }, [localResult])

  const interviewQuestions = useMemo<InterviewQuestion[]>(() => {
    const json = localResult?.interviewQuestionsJson
    if (!json) return []
    try {
      return JSON.parse(json) as InterviewQuestion[]
    } catch {
      return []
    }
  }, [localResult])

  const handleRunPreScreening = async () => {
    setScreeningState('idle') // reset to idle briefly before transitioning
    setError(null)
    try {
      await api.post(`/candidates/${candidate.id}/pre-screen`)
      // Backend returns 202 — start polling instead of awaiting result
      setScreeningState('polling')
      startPolling()
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: string } } }
      setError(
        apiError.response?.data?.error ?? 'Pre-screening failed. Please try again.'
      )
      setScreeningState('error')
    }
  }

  // ── Idle state ─────────────────────────────────────────────────────────────
  if (screeningState === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
        <p className="text-sm">No pre-screening data yet.</p>
        <Button onClick={handleRunPreScreening}>Run Pre-Screening</Button>
      </div>
    )
  }

  // ── Polling state — spinner while backend job runs ─────────────────────────
  if (screeningState === 'polling') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Analyzing...</p>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (screeningState === 'error') {
    return (
      <div className="flex flex-col gap-4 py-4">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="flex justify-center">
          <Button onClick={handleRunPreScreening}>Run Pre-Screening</Button>
        </div>
      </div>
    )
  }

  // ── Done / results state ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 py-4">
      {/* Profile Summary card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Profile Summary</CardTitle>
          {localResult?.overallFit != null && (
            <Badge variant="outline">{localResult.overallFit} / 5</Badge>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{localResult?.profileSummary}</p>
        </CardContent>
      </Card>

      {/* Red Flags card */}
      <Card>
        <CardHeader>
          <CardTitle>Red Flags ({redFlags.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {redFlags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No red flags identified.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {redFlags.map((flag, idx) => (
                <div key={idx} className="rounded-md border p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {flag.severity === 'high' && (
                      <Badge variant="destructive">high</Badge>
                    )}
                    {flag.severity === 'medium' && (
                      <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                        medium
                      </Badge>
                    )}
                    {flag.severity === 'low' && (
                      <Badge variant="outline">low</Badge>
                    )}
                    <span className="text-sm font-medium">{flag.claim}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Source: {flag.source}</p>
                  <p className="text-xs text-muted-foreground">
                    Validation: {flag.validationQuestion}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Interview Questions card */}
      <Card>
        <CardHeader>
          <CardTitle>Interview Questions ({interviewQuestions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-4 list-decimal list-inside">
            {interviewQuestions.map((q, idx) => (
              <li key={idx} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium">{q.question}</span>
                  {q.type === 'verification' ? (
                    <Badge variant="secondary" className="shrink-0">
                      verification
                    </Badge>
                  ) : (
                    <Badge variant="default" className="shrink-0">
                      role-fit
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground ml-4">
                  Rationale: {q.rationale}
                </p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Re-run button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleRunPreScreening}>
          Re-run Pre-Screening
        </Button>
      </div>
    </div>
  )
}

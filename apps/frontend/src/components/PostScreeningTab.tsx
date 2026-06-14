import { useState, useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import FileDropZone from '@/components/FileDropZone'
import api from '@/lib/api'
import type { CandidateDetail } from '@/lib/types'

interface Props {
  candidate: CandidateDetail
  onRefresh: () => void
}

// F-29: 'uploading' replaced by 'polling' — POST returns 202, component polls GET every 3s
type PostScreeningState = 'idle' | 'polling' | 'error' | 'done'

interface KeyFinding {
  type: 'strength' | 'concern' | 'unaddressed_flag'
  description: string
  relatedQuestion: string | null
}

interface ParsedReasoning {
  reasoning: string
  keyFindings: KeyFinding[]
  confidenceScore: number
}

function parseReasoning(reasoningJson: string | null): ParsedReasoning | null {
  if (!reasoningJson) return null
  try {
    return JSON.parse(reasoningJson) as ParsedReasoning
  } catch {
    return null
  }
}

function StarRating({ score }: { score: number }) {
  return (
    <span className="text-sm text-muted-foreground">
      Confidence:{' '}
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < score ? '★' : '☆'}</span>
      ))}
    </span>
  )
}

function FindingBadge({ type }: { type: KeyFinding['type'] }) {
  if (type === 'strength') return <Badge variant="default">{type}</Badge>
  if (type === 'concern') {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
        {type}
      </Badge>
    )
  }
  return <Badge variant="destructive">unaddressed flag</Badge>
}

function RecommendationBadge({ value }: { value: 'pass' | 'no_pass' | null }) {
  if (value === 'pass') {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-sm px-3 py-1">
        PASS
      </Badge>
    )
  }
  if (value === 'no_pass') {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-sm px-3 py-1">
        NO PASS
      </Badge>
    )
  }
  return null
}

export default function PostScreeningTab({ candidate, onRefresh }: Props) {
  const hasResults = !!(candidate.postScreening?.aiRecommendation)
  const [screeningState, setScreeningState] = useState<PostScreeningState>(
    hasResults ? 'done' : 'idle'
  )
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Tracks whether a decision submission is in-flight
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false)
  // Allows re-running even when results are already present
  const [showRerunForm, setShowRerunForm] = useState(false)

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

    if (
      candidate.status === 'decided' ||
      (candidate.preScreening != null && candidate.postScreening?.aiRecommendation != null)
    ) {
      stopPolling()
      setShowRerunForm(false)
      setScreeningState('done')
    } else if (candidate.preScreeningError) {
      // shared error field used for both pre- and post-screening failures (F-29 design)
      stopPolling()
      setError(candidate.preScreeningError)
      setScreeningState('error')
    }
  }, [candidate, screeningState])

  // Cleanup on unmount — prevents interval leak after navigating away
  useEffect(() => () => stopPolling(), [])

  const postScreening = candidate.postScreening
  const isDecided = !!(postScreening?.recruiterChoice)
  const parsed = parseReasoning(postScreening?.reasoningJson ?? null)

  async function handleRunPostScreening() {
    if (!transcriptFile) return
    setError(null)

    const formData = new FormData()
    formData.append('transcript', transcriptFile)

    try {
      await api.post(`/candidates/${candidate.id}/post-screen`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      // Backend returns 202 — start polling instead of awaiting result
      setTranscriptFile(null)
      setScreeningState('polling')
      startPolling()
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: string } } }
      setError(
        apiError.response?.data?.error ?? 'Post-screening failed. Please try again.'
      )
      setScreeningState('error')
    }
  }

  async function handleDecision(choice: 'pass' | 'no_pass') {
    setIsSubmittingDecision(true)
    try {
      await api.post(`/candidates/${candidate.id}/decision`, { choice })
      onRefresh()
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: string } } }
      setError(
        apiError.response?.data?.error ?? 'Failed to record decision. Please try again.'
      )
    } finally {
      setIsSubmittingDecision(false)
    }
  }

  // ── Idle / re-run form state ────────────────────────────────────────────────
  if (screeningState === 'idle' || screeningState === 'error' || showRerunForm) {
    return (
      <div className="flex flex-col gap-4 py-4">
        {screeningState === 'error' && error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {screeningState === 'idle' && !showRerunForm && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No post-screening data yet.
          </p>
        )}

        <FileDropZone
          label="Interview Transcript"
          accept=".txt,text/plain"
          onFile={setTranscriptFile}
          fileName={transcriptFile?.name}
        />

        <Button
          disabled={!transcriptFile}
          onClick={handleRunPostScreening}
        >
          Run Post-Screening
        </Button>
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

  // ── Done state (results + decision) ────────────────────────────────────────
  if (!postScreening || !parsed) {
    // Defensive: if we got to done but data is missing, show idle
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
        <p className="text-sm">No post-screening data yet.</p>
        <Button disabled>Run Post-Screening</Button>
      </div>
    )
  }

  const confirmedOrOverridden = postScreening.isOverride
    ? 'Overridden by recruiter'
    : 'Confirmed by recruiter'

  return (
    <div className="flex flex-col gap-6 py-4">
      {/* AI Recommendation */}
      <Card>
        <CardHeader>
          <CardTitle>AI Recommendation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <RecommendationBadge value={postScreening.aiRecommendation} />
          <StarRating score={parsed.confidenceScore} />
        </CardContent>
      </Card>

      {/* Reasoning */}
      <Card>
        <CardHeader>
          <CardTitle>Reasoning</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{parsed.reasoning}</p>
        </CardContent>
      </Card>

      {/* Key Findings */}
      <Card>
        <CardHeader>
          <CardTitle>Key Findings ({parsed.keyFindings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {parsed.keyFindings.map((finding, idx) => (
              <div key={idx} className="rounded-md border p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FindingBadge type={finding.type} />
                  <span className="text-sm">{finding.description}</span>
                </div>
                {finding.relatedQuestion && (
                  <p className="text-xs text-muted-foreground">
                    Related: {finding.relatedQuestion}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recruiter Decision section */}
      <Card>
        <CardHeader>
          <CardTitle>{isDecided ? 'Recruiter Decision' : 'Your Decision'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isDecided ? (
            /* State 5 — decided: show badge + label, no buttons */
            <div className="flex flex-col gap-2">
              <RecommendationBadge value={postScreening.recruiterChoice} />
              <p className="text-sm text-muted-foreground">{confirmedOrOverridden}</p>
            </div>
          ) : (
            /* State 4 — undecided: context-aware decision buttons per F-10 */
            <div className="flex gap-3">
              {postScreening.aiRecommendation === 'pass' ? (
                <>
                  <Button
                    variant="default"
                    disabled={isSubmittingDecision}
                    onClick={() => handleDecision('pass')}
                  >
                    Confirm Pass
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isSubmittingDecision}
                    onClick={() => handleDecision('no_pass')}
                  >
                    Override: No Pass
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="default"
                    disabled={isSubmittingDecision}
                    onClick={() => handleDecision('no_pass')}
                  >
                    Confirm No Pass
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isSubmittingDecision}
                    onClick={() => handleDecision('pass')}
                  >
                    Override: Pass
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Re-run button — visible in both State 4 and State 5 */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setTranscriptFile(null)
            setError(null)
            setShowRerunForm(true)
          }}
        >
          Re-run Post-Screening
        </Button>
      </div>
    </div>
  )
}

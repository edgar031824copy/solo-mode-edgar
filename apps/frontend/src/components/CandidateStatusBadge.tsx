import { Badge } from '@/components/ui/badge'

interface Props {
  status: 'pending' | 'pre_screened' | 'decided'
  recruiterChoice: 'pass' | 'no_pass' | null
}

export default function CandidateStatusBadge({ status, recruiterChoice }: Props) {
  if (status === 'pending') {
    return <Badge variant="secondary">Pending</Badge>
  }

  if (status === 'pre_screened') {
    return <Badge variant="outline">Pre-screened</Badge>
  }

  // decided
  if (recruiterChoice === 'pass') {
    return <Badge className="bg-green-600 text-white">Pass</Badge>
  }

  if (recruiterChoice === 'no_pass') {
    return <Badge variant="destructive">No Pass</Badge>
  }

  return <Badge variant="outline">Decided</Badge>
}

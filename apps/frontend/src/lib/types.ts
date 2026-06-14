export interface CandidateListItem {
  id: string;
  name: string;
  email: string | null;
  position: string | null;
  status: "pending" | "pre_screened" | "decided";
  cvFileName: string | null;
  linkedinFileName: string | null;
  createdAt: string;
  updatedAt: string;
  recruiterChoice: "pass" | "no_pass" | null;
}

export interface CandidateDetail extends CandidateListItem {
  notes: string | null;
  preScreeningError: string | null;  // F-29 — async job error signal
  preScreening: {
    id: string;
    profileSummary: string | null;
    redFlagsJson: string | null;
    interviewQuestionsJson: string | null;
    overallFit: number | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  postScreening: {
    id: string;
    transcriptFileName: string | null;
    aiRecommendation: "pass" | "no_pass" | null;
    recruiterChoice: "pass" | "no_pass" | null;
    isOverride: boolean | null;
    reasoningJson: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

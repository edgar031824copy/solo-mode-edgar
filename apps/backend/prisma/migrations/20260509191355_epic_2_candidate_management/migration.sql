-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('pending', 'pre_screened', 'decided');

-- CreateEnum
CREATE TYPE "PostScreeningDecision" AS ENUM ('pass', 'no_pass');

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "position" TEXT,
    "notes" TEXT,
    "cvFileName" TEXT,
    "linkedinFileName" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_screenings" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "profileSummary" TEXT,
    "redFlagsJson" TEXT,
    "interviewQuestionsJson" TEXT,
    "overallFit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_screenings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_screenings" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "transcriptFileName" TEXT,
    "aiRecommendation" "PostScreeningDecision",
    "recruiterChoice" "PostScreeningDecision",
    "isOverride" BOOLEAN,
    "reasoningJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_screenings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pre_screenings_candidateId_key" ON "pre_screenings"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "post_screenings_candidateId_key" ON "post_screenings"("candidateId");

-- AddForeignKey
ALTER TABLE "pre_screenings" ADD CONSTRAINT "pre_screenings_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_screenings" ADD CONSTRAINT "post_screenings_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

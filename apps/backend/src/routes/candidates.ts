import { Router } from "express";
import { uploadCandidateFiles, uploadTranscriptFile } from "../middleware/upload.js";
import {
  createCandidateHandler,
  listCandidatesHandler,
  getCandidateHandler,
  updateCandidateHandler,
  deleteCandidateHandler,
  getCandidateFileHandler,
  getReportHandler,
  preScreenCandidateHandler,
  postScreenCandidateHandler,
  recordDecisionHandler,
} from "../controllers/candidates.controller.js";

const router = Router();

// POST /candidates — multipart/form-data; multer parses cv + linkedin fields
router.post("/candidates", uploadCandidateFiles, createCandidateHandler);

// GET /candidates — list all (with recruiterChoice flattened)
router.get("/candidates", listCandidatesHandler);

// POST /candidates/:id/pre-screen — trigger Anthropic pre-screening analysis
// Must be registered before GET /candidates/:id to avoid route conflict
router.post("/candidates/:id/pre-screen", preScreenCandidateHandler);

// POST /candidates/:id/post-screen — transcript upload + Anthropic post-screening analysis
// uploadTranscriptFile multer middleware processes the "transcript" field before handler
router.post("/candidates/:id/post-screen", uploadTranscriptFile, postScreenCandidateHandler);

// POST /candidates/:id/decision — record recruiter confirm/override choice (F-10, F-11)
router.post("/candidates/:id/decision", recordDecisionHandler);

// GET /candidates/:id/report — F-12: full JSON report export
// Must be registered BEFORE GET /candidates/:id to prevent ":id" matching "report"
router.get("/candidates/:id/report", getReportHandler);

// GET /candidates/:id — full detail with relations
router.get("/candidates/:id", getCandidateHandler);

// PUT /candidates/:id — partial metadata update
router.put("/candidates/:id", updateCandidateHandler);

// DELETE /candidates/:id — cascade delete
router.delete("/candidates/:id", deleteCandidateHandler);

// GET /candidates/:id/files/:type — serve uploaded file
router.get("/candidates/:id/files/:type", getCandidateFileHandler);

export default router;

import multer from "multer";
import { Request } from "express";

// Epic 6 (F-24): CV and LinkedIn files use memory storage — buffers are uploaded
// directly to S3 by the controller. No temp files written to disk for these fields.
const memoryStorage = multer.memoryStorage();

// Only accept PDF and plain text — anything else is rejected early
function fileFilter(
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  if (
    file.mimetype === "application/pdf" ||
    file.mimetype === "text/plain"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type"));
  }
}

export const uploadCandidateFiles = multer({
  storage: memoryStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
}).fields([
  { name: "cv", maxCount: 1 },
  { name: "linkedin", maxCount: 1 },
]);

// ── Transcript upload (post-screening) ────────────────────────────────────────
// Transcript remains on disk — not in scope for F-24 S3 migration

const transcriptStorage = multer.diskStorage({
  destination(_req: Request, _file: Express.Multer.File, cb) {
    cb(null, "uploads/transcript/");
  },
  filename(_req: Request, file: Express.Multer.File, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

export const uploadTranscriptFile = multer({
  storage: transcriptStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req: Request, file: Express.Multer.File, cb) {
    // Accept text files only (.txt, .md, or plain text MIME types)
    const allowed = ["text/plain", "text/markdown", "application/octet-stream"];
    const isText = allowed.includes(file.mimetype) || file.originalname.endsWith(".txt");
    cb(null, isText);
  },
}).single("transcript");

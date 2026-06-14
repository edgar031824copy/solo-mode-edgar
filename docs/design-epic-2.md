# Design Doc — Epic 2: Candidate Management

**Epic:** 2
**Phase:** 1.0-complete
**F-IDs in scope:** F-01, F-02, F-13, F-14, F-15, F-16, F-17, F-18
**NF-IDs in scope:** NF-03b
**Architect:** epic-2-architect.md
**Depends on:** design-epic-1.md (Recruiter model, auth middleware, api.ts Axios instance)

> This document is additive. It does not redefine anything built in Epic 1.
> Recruiter model, auth routes, JWT middleware, and FE auth components are untouched.

---

## § DB Schema

Add the `Candidate` model to `apps/backend/prisma/schema.prisma`. The existing `Recruiter` model block is reproduced below only to show the relation — do not re-create the full Recruiter model from scratch; append `candidates` relation field to it.

### New Prisma blocks (append to schema.prisma)

```prisma
// ─── Candidate ────────────────────────────────────────────────────────────────
// Central entity. One candidate per upload session.
// Status progresses: pending → pre_screened → decided
// Cascade delete: onDelete: Cascade on all child relations ensures that
// deleting a Candidate in one Prisma call removes all related records.

model Candidate {
  id              String    @id @default(uuid())
  name            String
  email           String?
  position        String?
  notes           String?

  // File metadata — filenames stored on record per F-02; actual files on disk
  cvFileName      String?
  linkedinFileName String?

  // Status lifecycle
  status          CandidateStatus @default(pending)

  // Relations — cascaded on delete so DELETE /candidates/:id is one call
  preScreening    PreScreening?
  postScreening   PostScreening?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("candidates")
}

enum CandidateStatus {
  pending
  pre_screened
  decided
}

// ─── PreScreening ─────────────────────────────────────────────────────────────
// Populated by Epic 3 (POST /candidates/:id/pre-screen).
// Defined here so the FK is available from Epic 2 onward.

model PreScreening {
  id                  String    @id @default(uuid())
  candidateId         String    @unique
  candidate           Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  // Raw JSON blob from Claude — structured per Epic 3 Anthropic output shape
  profileSummary      String?
  redFlagsJson        String?   // JSON array, parsed at read time
  interviewQuestionsJson String? // JSON array, parsed at read time
  overallFit          Int?      // 1–5

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@map("pre_screenings")
}

// ─── PostScreening ────────────────────────────────────────────────────────────
// Populated by Epic 4 (POST /candidates/:id/post-screen).
// Defined here so the FK is available from Epic 2 onward.

model PostScreening {
  id                  String    @id @default(uuid())
  candidateId         String    @unique
  candidate           Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  transcriptFileName  String?   // uploaded interview transcript filename
  aiRecommendation    PostScreeningDecision?
  recruiterChoice     PostScreeningDecision?
  // true = recruiter confirmed AI; false = recruiter overrode AI
  isOverride          Boolean?
  reasoningJson       String?   // Claude reasoning blob, JSON

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@map("post_screenings")
}

enum PostScreeningDecision {
  pass
  no_pass
}
```

### Relation field to append to existing Recruiter model (additive only)

No relation between Recruiter and Candidate is required for MVP — candidates are global to the single-tenant system. Do not add a recruiterId FK at this stage.

### Design justifications

- `cvFileName`/`linkedinFileName` are `String?` — file may not exist yet at record creation (name + email submitted first, file uploaded after).
- `PreScreening` and `PostScreening` are defined in Epic 2 schema so migrations run clean and Epics 3–4 only add controller logic, not schema changes.
- `onDelete: Cascade` on both child models ensures `DELETE /candidates/:id` removes all related records in one Prisma `delete` call (satisfies F-18).
- `recruiterChoice` on `PostScreening` is the authoritative field returned by `GET /candidates` for the Pass/No Pass badge (F-14).
- Status enum uses lowercase snake_case to match PostgreSQL convention and avoid migration diffs.

---

## § API Contract

All routes in this section require `Authorization: Bearer <token>` (Epic 1 middleware already applied globally in `app.ts` after `/health` and `/auth/login`).

File uploads use `multipart/form-data`. All other endpoints use `application/json`.

---

### POST /candidates

Create a new candidate record with uploaded files.

```
Method: POST
Path:   /candidates
Auth required: yes
Content-Type: multipart/form-data

Form fields:
  name             string  (required)
  email            string? (optional)
  position         string? (optional, target position used by Epic 3 prompt)
  notes            string? (optional free-text)
  cv               File    (optional, PDF — stored to uploads/cv/)
  linkedin         File    (optional, PDF or plain text — stored to uploads/linkedin/)

Response 201:
{
  id:               string  (UUID)
  name:             string
  email:            string | null
  position:         string | null
  notes:            string | null
  cvFileName:       string | null
  linkedinFileName: string | null
  status:           "pending"
  createdAt:        string  (ISO-8601)
  updatedAt:        string  (ISO-8601)
}

Response 400: { error: "name is required" }
Response 401: { error: "Unauthorized" }
Response 500: { error: "Internal server error" }
```

**File storage:** Multer stores files to `apps/backend/uploads/cv/` and `apps/backend/uploads/linkedin/` using a timestamp-prefixed original name (`Date.now() + '-' + originalname`). The stored filename (not the full path) is written to `cvFileName` / `linkedinFileName` on the Candidate record.

---

### GET /candidates

List all candidates, ordered by `createdAt` descending.

```
Method: GET
Path:   /candidates
Auth required: yes

Response 200:
[
  {
    id:               string
    name:             string
    email:            string | null
    position:         string | null
    status:           "pending" | "pre_screened" | "decided"
    cvFileName:       string | null
    linkedinFileName: string | null
    createdAt:        string
    updatedAt:        string
    recruiterChoice:  "pass" | "no_pass" | null  // derived from PostScreening.recruiterChoice
  },
  ...
]

Response 401: { error: "Unauthorized" }
Response 500: { error: "Internal server error" }
```

**Note:** `recruiterChoice` is returned for every candidate regardless of status. It will be `null` unless `PostScreening.recruiterChoice` is set. The FE uses it to render the Pass (green) / No Pass (red) badge on decided candidates (F-14). The BE must do a `findMany` with `include: { postScreening: { select: { recruiterChoice: true } } }` and flatten `recruiterChoice` into the response shape.

---

### GET /candidates/:id

Fetch full candidate record for the detail view.

```
Method: GET
Path:   /candidates/:id
Auth required: yes

Response 200:
{
  id:               string
  name:             string
  email:            string | null
  position:         string | null
  notes:            string | null
  cvFileName:       string | null
  linkedinFileName: string | null
  status:           "pending" | "pre_screened" | "decided"
  createdAt:        string
  updatedAt:        string
  preScreening: {
    id:                     string
    profileSummary:         string | null
    redFlagsJson:           string | null
    interviewQuestionsJson: string | null
    overallFit:             number | null
    createdAt:              string
    updatedAt:              string
  } | null
  postScreening: {
    id:                string
    transcriptFileName: string | null
    aiRecommendation:  "pass" | "no_pass" | null
    recruiterChoice:   "pass" | "no_pass" | null
    isOverride:        boolean | null
    reasoningJson:     string | null
    createdAt:         string
    updatedAt:         string
  } | null
}

Response 401: { error: "Unauthorized" }
Response 404: { error: "Candidate not found" }
Response 500: { error: "Internal server error" }
```

---

### PUT /candidates/:id

Update candidate metadata (name, email, position, notes). Does not accept files — use the upload endpoint for file replacement.

```
Method: PUT
Path:   /candidates/:id
Auth required: yes
Content-Type: application/json

Request body (all fields optional — partial update):
{
  name:     string?
  email:    string?
  position: string?
  notes:    string?
}

Response 200: (same shape as GET /candidates/:id — full candidate with relations)

Response 400: { error: "No fields to update" }
Response 401: { error: "Unauthorized" }
Response 404: { error: "Candidate not found" }
Response 500: { error: "Internal server error" }
```

---

### DELETE /candidates/:id

Permanently delete a candidate and all related records (F-18 cascade delete).

```
Method: DELETE
Path:   /candidates/:id
Auth required: yes

Response 204: (no body)

Response 401: { error: "Unauthorized" }
Response 404: { error: "Candidate not found" }
Response 500: { error: "Internal server error" }
```

**Implementation note:** Prisma's `delete` on `Candidate` triggers `onDelete: Cascade` on `PreScreening` and `PostScreening`. The controller calls `prisma.candidate.delete({ where: { id } })` — no manual child deletion needed.

---

### GET /candidates/:id/files/:type

Serve an uploaded file for inline viewing (CV or LinkedIn export).

```
Method: GET
Path:   /candidates/:id/files/:type
        :type = "cv" | "linkedin"
Auth required: yes

Response 200: Binary file stream
  Content-Type: application/pdf  (or text/plain for .txt linkedin exports)
  Content-Disposition: inline; filename="<original>"

Response 400: { error: "Invalid file type" }
Response 401: { error: "Unauthorized" }
Response 404: { error: "File not found" }
```

**Implementation note:** Controller looks up `candidate.cvFileName` or `candidate.linkedinFileName`, resolves the path under `uploads/cv/` or `uploads/linkedin/`, and pipes it with `res.sendFile`. This is used by the FE to render a clickable link in the Details card.

---

## § FE Component Tree

### Routes

```
/login               → LoginPage        (public — Epic 1, unchanged)
/                    → DashboardPage    (protected — REPLACE stub with full implementation)
/candidates/:id      → CandidateDetailPage  (protected — NEW in Epic 2)
```

### DashboardPage (replace stub at `src/pages/DashboardPage.tsx`)

**Route:** `/`
**Purpose:** Candidate list view with add-candidate action (F-13, F-14, F-16, F-17, F-18)

**Layout:** Full-height column flex. Top section is a heading row with a "New Candidate" button; below is the candidate table.

```
DashboardPage
  ├── PageHeader (h1 "Candidates" + Button "New Candidate" — shadcn Button variant="default")
  ├── CandidateTable
  │   ├── shadcn Table > TableHeader > TableRow
  │   │     columns: Name | Position | Status | CV | LinkedIn | Created | Actions
  │   └── TableBody — one TableRow per candidate
  │         ├── Name cell — clickable link → /candidates/:id
  │         ├── Position cell — text or "—"
  │         ├── Status cell — CandidateStatusBadge
  │         ├── CV cell — filename text (truncated) or "—"
  │         ├── LinkedIn cell — filename text (truncated) or "—"
  │         ├── Created cell — formatted date
  │         └── Actions cell — DropdownMenu (shadcn) with "View" + "Delete" items
  └── NewCandidateDialog (shadcn Dialog — mounted in DashboardPage, toggled by "New Candidate" button)
```

**CandidateStatusBadge** (`src/components/CandidateStatusBadge.tsx`):
- `pending` → shadcn Badge variant="secondary" text "Pending"
- `pre_screened` → Badge variant="outline" text "Pre-screened"
- `decided` + `recruiterChoice = "pass"` → Badge variant="default" className="bg-green-600 text-white" text "Pass"
- `decided` + `recruiterChoice = "no_pass"` → Badge variant="destructive" text "No Pass"
- `decided` + `recruiterChoice = null` → Badge variant="outline" text "Decided"

**NewCandidateDialog** (`src/components/NewCandidateDialog.tsx`):
- shadcn Dialog with DialogContent
- Form fields (shadcn Input + Label):
  - Name (required, text)
  - Email (optional, email)
  - Position (optional, text — hint: "e.g. Senior Backend Engineer")
  - Notes (optional, shadcn Textarea)
- File upload area for CV (drag-and-drop zone + file input button, accepts `application/pdf`)
- File upload area for LinkedIn export (drag-and-drop zone + file input, accepts `application/pdf,text/plain`)
- Submit sends `multipart/form-data` via `POST /candidates`
- On success: closes dialog, refreshes candidate list
- On error: shows shadcn Alert destructive with error message

**FileDropZone** (`src/components/FileDropZone.tsx`):
- Reusable drag-and-drop + click-to-browse component
- Props: `label: string`, `accept: string`, `onFile: (file: File) => void`, `fileName?: string`
- Uses HTML5 `dragover`/`drop` events; visual feedback: border-dashed border-2 border-primary/40 on idle; border-primary on drag-over
- Shows selected filename when `fileName` is set; otherwise shows "Drop file here or click to browse"
- Tailwind classes: `rounded-lg p-6 text-center cursor-pointer transition-colors`

**DeleteConfirmDialog** (`src/components/DeleteConfirmDialog.tsx`):
- shadcn AlertDialog with destructive confirm button
- Props: `candidateId: string`, `candidateName: string`, `open: boolean`, `onOpenChange`, `onDeleted: () => void`
- On confirm: calls `DELETE /candidates/:id`, then calls `onDeleted()` to refresh list
- On cancel: closes without action

**State management (DashboardPage):**
- Local React state (`useState`) for: `candidates: CandidateListItem[]`, `loading: boolean`, `newDialogOpen: boolean`, `deleteTarget: { id, name } | null`
- `useEffect` on mount calls `GET /candidates` via `api` instance from `src/lib/api.ts`
- No global store needed for Epic 2 — all state is page-local

---

### CandidateDetailPage (new at `src/pages/CandidateDetailPage.tsx`)

**Route:** `/candidates/:id`
**Purpose:** Full candidate detail with tab-based layout (F-15, F-17)

```
CandidateDetailPage
  ├── BackButton (← Candidates, navigates to /)
  ├── CandidateDetailsCard
  │     shadcn Card with CardHeader (candidate name + position as CardTitle/CardDescription)
  │     CardContent grid-cols-2 gap-4:
  │       Created: <date>        Updated: <date>
  │       CV File: <link|"—">    LinkedIn File: <link|"—">
  │       Notes: <text|"—">      (spans full width if present)
  └── shadcn Tabs (defaultValue="pre-screening")
        ├── TabsList
        │     TabsTrigger value="pre-screening"  → "Pre-Screening"
        │     TabsTrigger value="post-screening" → "Post-Screening"
        ├── TabsContent value="pre-screening"
        │     → PreScreeningTab
        └── TabsContent value="post-screening"
              → PostScreeningTab
```

**CandidateDetailsCard** (`src/components/CandidateDetailsCard.tsx`):
- Inline display of Created, Updated (formatted with `toLocaleDateString`), CV File, LinkedIn File, Notes
- CV File and LinkedIn File rendered as `<a href="/api/candidates/:id/files/cv" target="_blank">` links when filename is non-null; otherwise "—"
- shadcn Card, CardHeader, CardContent

**PreScreeningTab** (`src/components/PreScreeningTab.tsx`):
- Epic 2 renders this as a stub: empty state with a "Run Pre-Screening" Button (variant="default")
- Button is wired but disabled in Epic 2 — the onClick handler is a no-op placeholder; Epic 3 fills in the actual call to `POST /candidates/:id/pre-screen`
- If `candidate.preScreening` is non-null (future state), show "Pre-screening complete" placeholder text
- Tailwind layout: `flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground`

**PostScreeningTab** (`src/components/PostScreeningTab.tsx`):
- Epic 2 renders this as a stub: empty state with a "Run Post-Screening" Button (variant="default", disabled)
- Same pattern as PreScreeningTab; Epic 4 fills in the actual implementation
- Tailwind layout: `flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground`

**State management (CandidateDetailPage):**
- Local state: `candidate: CandidateDetail | null`, `loading: boolean`, `error: string | null`
- `useEffect` on mount (keyed on `id` param) calls `GET /candidates/:id`
- `useParams` from react-router-dom to extract `id`

---

### New shadcn/ui components to install (additive)

The following shadcn/ui components are not yet present in `src/components/ui/` and must be added via `npx shadcn@latest add <component>`:

- `table` — used by CandidateTable
- `dialog` — used by NewCandidateDialog
- `alert-dialog` — used by DeleteConfirmDialog
- `dropdown-menu` — used by Actions column
- `tabs` — used by CandidateDetailPage
- `textarea` — used by NewCandidateDialog notes field
- `label` — used by all form fields
- `separator` — used in details card
- `skeleton` — used for loading states

Existing: `button`, `badge`, `card`, `input`, `alert` — do not re-install.

---

### TypeScript types (add to `src/lib/types.ts` — new file)

```ts
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
```

---

### React Router update (additive — modify `src/App.tsx`)

Add the `/candidates/:id` route inside the existing `ProtectedRoute` / `ProtectedShell` wrapper. Do not remove or change existing routes.

```tsx
// Inside the protected Routes block — add alongside existing "/ → DashboardPage":
<Route path="/candidates/:id" element={<CandidateDetailPage />} />
```

---

## § BE Folder Structure

Only new or modified files are listed. Existing Epic 1 files are not repeated.

```
apps/backend/
├── prisma/
│   └── schema.prisma            ← MODIFY: add Candidate, PreScreening, PostScreening, enums
├── src/
│   ├── routes/
│   │   └── candidates.ts        ← REPLACE stub: mount all candidate routes + multer middleware
│   ├── controllers/
│   │   └── candidates.controller.ts  ← REPLACE stub: implement all handlers
│   ├── services/
│   │   ├── candidates.service.ts     ← REPLACE stub: Prisma CRUD + file path resolution
│   │   └── fileParser.service.ts     ← REPLACE stub: PDF text extraction (pdf-parse) + plain-text read
│   ├── middleware/
│   │   └── upload.ts            ← REPLACE stub: configure multer (disk storage, file filter, size limit)
│   └── tests/
│       └── candidates.test.ts   ← REPLACE stub: full integration test suite (see below)
└── uploads/
    ├── cv/                      ← created at startup if missing (fs.mkdirSync recursive)
    └── linkedin/                ← created at startup if missing
```

**upload.ts — multer configuration:**
- Storage: `multer.diskStorage` — destination based on fieldname (`cv` → `uploads/cv/`, `linkedin` → `uploads/linkedin/`)
- Filename: `Date.now() + '-' + file.originalname`
- File filter: accept `application/pdf` and `text/plain` only; reject others with `400 Unsupported file type`
- Limits: `fileSize: 10 * 1024 * 1024` (10 MB per file)
- Export named multer instances: `uploadCandidateFiles` (fields: `[{ name: 'cv', maxCount: 1 }, { name: 'linkedin', maxCount: 1 }]`)

**fileParser.service.ts:**
- `parsePdf(filePath: string): Promise<string>` — uses `pdf-parse` npm package; returns extracted text
- `readTextFile(filePath: string): Promise<string>` — `fs.readFile` UTF-8
- Both functions log errors and return empty string on failure (non-fatal — Epic 3 needs the text but Epic 2 only stores filenames)

**candidates.test.ts — required test cases:**
```
describe("Candidates API")
  POST /candidates
    - creates candidate with name only (no files) → 201, status=pending
    - creates candidate with name + cv file → 201, cvFileName non-null
    - returns 400 when name is missing
    - returns 401 when no auth token
  GET /candidates
    - returns empty array when no candidates
    - returns array with recruiterChoice field
    - returns 401 when no auth token
  GET /candidates/:id
    - returns full candidate with null preScreening and postScreening
    - returns 404 for unknown id
    - returns 401 when no auth token
  PUT /candidates/:id
    - updates notes field
    - returns 404 for unknown id
  DELETE /candidates/:id
    - returns 204 and candidate is gone
    - returns 404 for unknown id
```

---

### NF-03b compliance

No candidate PII (name, email, CV text content) is stored in-memory or returned in API responses beyond what is explicitly modeled in the Prisma schema. File content is read from disk only when needed (Epic 3 calls `fileParser.service.ts`). The API never returns raw file text — only filenames. Upload directory (`uploads/`) must be listed in `.gitignore`.

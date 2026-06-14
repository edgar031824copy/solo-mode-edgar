/**
 * Epic 2 Candidate Management — E2E tests
 *
 * Covers: F-01, F-02, F-13, F-14, F-15, F-16, F-17, F-18, NF-03b
 * No Anthropic API calls — pre/post-screening are stubs in Epic 2.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { loginAsRecruiter } from './helpers/auth';

const CANDIDATE_NAME = 'QA Candidate — Epic 2';
const DELETE_CANDIDATE_NAME = 'QA Delete Test — Epic 2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CV_FIXTURE = path.join(__dirname, 'fixtures', 'sample-cv.pdf');
const LINKEDIN_FIXTURE = path.join(__dirname, 'fixtures', 'sample-linkedin.txt');

/** Get the JWT token from localStorage after loginAsRecruiter. */
async function getToken(page: Page): Promise<string> {
  return (await page.evaluate(() => localStorage.getItem('auth_token'))) ?? '';
}

/** Delete all candidates matching the given name via direct API call. */
async function cleanupCandidateByName(page: Page, name: string) {
  const token = await getToken(page);
  if (!token) return;
  const resp = await page.request.get('http://localhost:3001/candidates', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok()) return;
  const candidates: Array<{ id: string; name: string }> = await resp.json();
  for (const c of candidates) {
    if (c.name === name) {
      await page.request.delete(`http://localhost:3001/candidates/${c.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }
}

/**
 * Open New Candidate dialog, fill fields, optionally upload files, submit.
 * Returns after the candidate link is visible in the list (confirms dialog closed and list refreshed).
 */
async function createCandidate(
  page: Page,
  opts: { name: string; position?: string; cvFile?: string; linkedinFile?: string }
) {
  await page.getByRole('button', { name: 'New Candidate' }).click();

  // Wait for dialog to open — look for the Name input to be visible
  await expect(page.locator('#nc-name')).toBeVisible({ timeout: 5000 });

  await page.fill('#nc-name', opts.name);
  if (opts.position) await page.fill('#nc-position', opts.position);

  if (opts.cvFile || opts.linkedinFile) {
    const fileInputs = page.locator('[data-testid="file-input"]');
    if (opts.cvFile) await fileInputs.nth(0).setInputFiles(opts.cvFile);
    if (opts.linkedinFile) await fileInputs.nth(1).setInputFiles(opts.linkedinFile);
  }

  await page.getByRole('button', { name: 'Create Candidate' }).click();

  // Wait for the candidate link to appear in the list — this confirms:
  // 1. Form submitted successfully
  // 2. Dialog closed
  // 3. List refreshed with new candidate
  await expect(page.getByRole('link', { name: opts.name })).toBeVisible({ timeout: 15000 });
}

test.describe('Epic 2 — Candidate Management', () => {
  // Allow extra time for first-login cold start
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await loginAsRecruiter(page);
    await cleanupCandidateByName(page, CANDIDATE_NAME);
    await cleanupCandidateByName(page, DELETE_CANDIDATE_NAME);
  });

  test.afterEach(async ({ page }) => {
    await cleanupCandidateByName(page, CANDIDATE_NAME);
    await cleanupCandidateByName(page, DELETE_CANDIDATE_NAME);
  });

  // ─────────────────────────────────────────────
  // F-13, F-14: Dashboard loads with heading and New Candidate button
  // ─────────────────────────────────────────────
  test('F-13, F-14: dashboard loads with Candidates heading and New Candidate button', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    // Page heading visible (F-13: simple intuitive UI)
    await expect(page.getByRole('heading', { name: 'Candidates' })).toBeVisible({ timeout: 10000 });

    // New Candidate button (F-13: simple UI)
    await expect(page.getByRole('button', { name: 'New Candidate' })).toBeVisible();
  });

  // ─────────────────────────────────────────────
  // F-14: Candidate list shows table with Name + Status columns
  // ─────────────────────────────────────────────
  test('F-14: candidate list table shows Name and Status columns', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    // Create a candidate so the table renders (DashboardPage shows <p> if empty)
    await createCandidate(page, { name: CANDIDATE_NAME, position: 'Engineer' });

    // Table appears (F-14: candidate list view)
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  });

  // ─────────────────────────────────────────────
  // F-01, F-16: Create candidate with CV + LinkedIn file uploads
  // ─────────────────────────────────────────────
  test('F-01, F-16: create candidate with CV and LinkedIn file uploads', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    await page.getByRole('button', { name: 'New Candidate' }).click();

    // Dialog opens — Name input is visible (F-16: upload interface present)
    await expect(page.locator('#nc-name')).toBeVisible({ timeout: 5000 });

    await page.fill('#nc-name', CANDIDATE_NAME);
    await page.fill('#nc-position', 'Senior Engineer');

    // Upload files via hidden file inputs (F-01: CV PDF + LinkedIn; F-16: drag & drop or button)
    const fileInputs = page.locator('[data-testid="file-input"]');
    await fileInputs.nth(0).setInputFiles(CV_FIXTURE);
    await fileInputs.nth(1).setInputFiles(LINKEDIN_FIXTURE);

    // Drop zones show selected filenames (F-16: visual feedback after file selection)
    await expect(page.locator('[data-testid="drop-zone"]').nth(0)).toContainText('sample-cv.pdf');
    await expect(page.locator('[data-testid="drop-zone"]').nth(1)).toContainText('sample-linkedin.txt');

    await page.getByRole('button', { name: 'Create Candidate' }).click();

    // Candidate appears in list — confirms successful creation (F-01: files accepted)
    await expect(page.getByRole('link', { name: CANDIDATE_NAME })).toBeVisible({ timeout: 15000 });
  });

  // ─────────────────────────────────────────────
  // F-02, F-14: Candidate appears with Pending badge + filenames in list
  // ─────────────────────────────────────────────
  test('F-02, F-14: created candidate shows Pending badge and CV filename in list', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    await createCandidate(page, {
      name: CANDIDATE_NAME,
      position: 'Senior Engineer',
      cvFile: CV_FIXTURE,
      linkedinFile: LINKEDIN_FIXTURE,
    });

    // Row exists in list
    const row = page.locator('tr').filter({ hasText: CANDIDATE_NAME });
    await expect(row).toBeVisible({ timeout: 10000 });

    // Status badge shows Pending (F-14: status badge for new candidate)
    await expect(row.getByText('Pending')).toBeVisible();

    // CV filename shown in row (F-02: stored filenames displayed in list view)
    // The stored filename is timestamp-prefixed (e.g. "1700000000000-sample-cv.pdf") and
    // truncated at 24 chars in the list. Check for the original name fragment visible in truncated text.
    await expect(row).toContainText('sample-cv');
  });

  // ─────────────────────────────────────────────
  // F-15, F-02: Candidate detail page — tab layout + Details card + file links
  // ─────────────────────────────────────────────
  test('F-15, F-02: detail page has tabs, Details card with dates and file links', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    await createCandidate(page, {
      name: CANDIDATE_NAME,
      position: 'QA Test Position',
      cvFile: CV_FIXTURE,
      linkedinFile: LINKEDIN_FIXTURE,
    });

    // Navigate to detail page by clicking candidate name link (F-15: single candidate detail view)
    await page.getByRole('link', { name: CANDIDATE_NAME }).click();
    await page.waitForURL(/\/candidates\/[a-z0-9-]+$/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/candidates\/[a-z0-9-]+$/);

    // Tab-based layout (F-15)
    await expect(page.getByRole('tab', { name: 'Pre-Screening' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Post-Screening' })).toBeVisible();

    // Details card shows Created and Updated dates (F-15: Details card at top)
    await expect(page.getByText('Created')).toBeVisible();
    await expect(page.getByText('Updated')).toBeVisible();

    // File links in Details card (F-02: stored filenames displayed in detail view)
    await expect(page.getByText('CV File')).toBeVisible();
    await expect(page.getByText('LinkedIn File')).toBeVisible();
    await expect(page.getByRole('link', { name: 'sample-cv.pdf' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'sample-linkedin.txt' })).toBeVisible();
  });

  // ─────────────────────────────────────────────
  // F-17: Run buttons present (disabled stubs in Epic 2)
  // ─────────────────────────────────────────────
  test('F-17: Run Pre-Screening and Run Post-Screening buttons present in tabs', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    await createCandidate(page, { name: CANDIDATE_NAME });

    // Navigate to detail page
    await page.getByRole('link', { name: CANDIDATE_NAME }).click();
    await page.waitForURL(/\/candidates\/[a-z0-9-]+$/, { timeout: 10000 });

    // Pre-Screening tab is default — Run Pre-Screening button present (F-17)
    await expect(page.getByRole('button', { name: 'Run Pre-Screening' })).toBeVisible({ timeout: 5000 });

    // Switch to Post-Screening tab — Run Post-Screening button present (F-17)
    await page.getByRole('tab', { name: 'Post-Screening' }).click();
    await expect(page.getByRole('button', { name: 'Run Post-Screening' })).toBeVisible({ timeout: 5000 });
  });

  // ─────────────────────────────────────────────
  // F-18: Delete candidate with confirmation dialog
  // ─────────────────────────────────────────────
  test('F-18: delete candidate via Actions menu with confirmation removes it from list', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    await createCandidate(page, { name: DELETE_CANDIDATE_NAME, position: 'Test Position' });

    // Wait for candidate row to appear
    const row = page.locator('tr').filter({ hasText: DELETE_CANDIDATE_NAME });
    await expect(row).toBeVisible({ timeout: 10000 });

    // Open the Actions dropdown — the trigger button has sr-only "Actions" inside it
    const actionsBtn = row.locator('button').filter({
      has: page.locator('span.sr-only', { hasText: 'Actions' }),
    });
    await actionsBtn.click();

    // Click Delete in the dropdown (F-18: delete button in actions menu)
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    // Confirmation dialog appears (F-18: confirmation required before deletion)
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('alertdialog')).toContainText('Delete candidate');

    // Confirm deletion using the destructive Delete button inside the alertdialog
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

    // Row is gone from list (F-18: cascade delete confirmed)
    await expect(page.locator('tr').filter({ hasText: DELETE_CANDIDATE_NAME })).not.toBeVisible({
      timeout: 10000,
    });
  });
});

// ─────────────────────────────────────────────
// NF-03b: No PII in API responses beyond modeled fields
// ─────────────────────────────────────────────
test.describe('NF-03b: API responses contain no unexpected PII fields', () => {
  test('GET /candidates returns only modeled fields', async ({ page }) => {
    // Log in to get a valid JWT
    await loginAsRecruiter(page);
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).not.toBeNull();

    // Call the backend directly (Playwright page.request bypasses the Vite proxy)
    const resp = await page.request.get('http://localhost:3001/candidates', {
      headers: {
        Authorization: `Bearer ${token!}`,
        Accept: 'application/json',
      },
    });
    expect(resp.status()).toBe(200);

    const candidates: Array<Record<string, unknown>> = await resp.json();

    // Modeled fields allowed in list response (CandidateListItem)
    const ALLOWED_FIELDS = new Set([
      'id', 'name', 'email', 'position', 'status', 'cvFileName',
      'linkedinFileName', 'createdAt', 'updatedAt', 'recruiterChoice', 'notes',
    ]);

    for (const c of candidates) {
      for (const key of Object.keys(c)) {
        expect(
          ALLOWED_FIELDS.has(key),
          `Unexpected field "${key}" in GET /candidates — potential PII leak`
        ).toBeTruthy();
      }
    }
  });
});

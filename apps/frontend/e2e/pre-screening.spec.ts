/**
 * Epic 3 Pre-Screening — E2E tests
 *
 * Covers: F-03, F-04, F-05, F-06
 * Requires ANTHROPIC_API_KEY to be set — tests are skipped if not.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { loginAsRecruiter } from './helpers/auth';

// Skip all tests in this file if the Anthropic API key is not present
test.skip(!process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY not set');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CV_FIXTURE = path.join(__dirname, 'fixtures', 'sample-cv.pdf');

const CANDIDATE_NAME = 'QA Pre-Screening — Epic 3';

async function getToken(page: Page): Promise<string> {
  return (await page.evaluate(() => localStorage.getItem('auth_token'))) ?? '';
}

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

async function createCandidateWithCV(page: Page, name: string) {
  await page.getByRole('button', { name: /new candidate/i }).click();
  await page.getByLabel(/name/i).fill(name);
  await page.getByLabel(/position/i).fill('Senior Engineer');

  // Upload CV file
  const cvInput = page.locator('input[type="file"]').first();
  await cvInput.setInputFiles(CV_FIXTURE);

  await page.getByRole('button', { name: /create candidate/i }).click();

  // Wait for the candidate to appear in the list
  await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 10000 });
}

test.describe('Pre-Screening', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRecruiter(page);
    await cleanupCandidateByName(page, CANDIDATE_NAME);
  });

  test.afterEach(async ({ page }) => {
    await cleanupCandidateByName(page, CANDIDATE_NAME);
  });

  test('run pre-screening happy path: profile summary and 5 questions render', async ({ page }) => {
    // Create candidate with CV on dashboard
    await createCandidateWithCV(page, CANDIDATE_NAME);

    // Navigate to detail page
    await page.getByRole('link', { name: CANDIDATE_NAME }).click();
    await expect(page.getByRole('heading', { name: CANDIDATE_NAME })).toBeVisible();

    // Click "Pre-Screening" tab (should already be active by default)
    await page.getByRole('tab', { name: /pre-screening/i }).click();

    // Run pre-screening — Claude API call may take up to 30 seconds
    await page.getByRole('button', { name: /run pre-screening/i }).click();

    // Wait for results to render (generous timeout for Anthropic latency)
    await expect(page.getByText(/profile summary/i)).toBeVisible({ timeout: 60000 });

    // Profile summary card should have text content
    const summaryCard = page.locator('[data-slot="card"]').filter({ hasText: /profile summary/i });
    await expect(summaryCard).toBeVisible();

    // Exactly 5 interview questions listed
    const questionItems = page.locator('li');
    await expect(questionItems).toHaveCount(5, { timeout: 30000 });

    // No error alert
    await expect(page.getByRole('alert')).not.toBeVisible();
  });

  test('status badge advances to pre_screened after run', async ({ page }) => {
    await createCandidateWithCV(page, CANDIDATE_NAME);
    await page.getByRole('link', { name: CANDIDATE_NAME }).click();

    // Run pre-screening
    await page.getByRole('button', { name: /run pre-screening/i }).click();
    await expect(page.getByText(/profile summary/i)).toBeVisible({ timeout: 60000 });

    // Status badge on the detail page should update to pre_screened
    await expect(page.getByText(/pre.?screened/i)).toBeVisible({ timeout: 5000 });
  });

  test('dashboard status updates to pre_screened after run', async ({ page }) => {
    await createCandidateWithCV(page, CANDIDATE_NAME);
    await page.getByRole('link', { name: CANDIDATE_NAME }).click();

    // Run pre-screening
    await page.getByRole('button', { name: /run pre-screening/i }).click();
    await expect(page.getByText(/profile summary/i)).toBeVisible({ timeout: 60000 });

    // Navigate back to dashboard
    await page.getByRole('button', { name: /candidates/i }).click();
    await expect(page.url()).toContain('localhost');
    // Confirm the candidate row shows the pre_screened badge
    const row = page.getByRole('row', { name: new RegExp(CANDIDATE_NAME, 'i') });
    await expect(row.getByText(/pre.?screened/i)).toBeVisible({ timeout: 5000 });
  });
});

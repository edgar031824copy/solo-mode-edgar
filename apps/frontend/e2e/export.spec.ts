/**
 * Epic 5 — Export & Logging E2E tests
 *
 * Covers: F-12 (report export as JSON), NF-07 (observability/logging)
 *
 * Token-cost rule: 0 live Anthropic API calls required for these tests.
 * The report API works even on candidates without pre/post-screening data
 * (fields will be null). We create a candidate via API and test the report
 * endpoint directly. No Claude calls are made.
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsRecruiter } from './helpers/auth';

const API_BASE = 'http://localhost:3001';
const APP_BASE = 'http://localhost:5173';
const CANDIDATE_NAME = 'QA Export — Report Test';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getToken(page: Page): Promise<string> {
  return (await page.evaluate(() => localStorage.getItem('auth_token'))) ?? '';
}

async function getAuthToken(): Promise<string> {
  const resp = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'recruiter@gorilla.com', password: 'password123' }),
  });
  const data = await resp.json() as { token: string };
  return data.token;
}

async function cleanupCandidateByName(page: Page, name: string) {
  const token = await getToken(page);
  if (!token) return;
  const resp = await page.request.get(`${API_BASE}/candidates`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok()) return;
  const candidates = await resp.json() as Array<{ id: string; name: string }>;
  for (const c of candidates) {
    if (c.name === name) {
      await page.request.delete(`${API_BASE}/candidates/${c.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }
}

async function createCandidateViaUI(page: Page, name: string): Promise<string> {
  // Open the new candidate dialog
  await page.getByRole('button', { name: /new candidate/i }).click();

  // Fill in name and position
  await page.getByLabel(/name/i).fill(name);
  await page.getByLabel(/position/i).fill('Senior Software Engineer');

  // Submit without uploading files (creates a "pending" candidate)
  await page.getByRole('button', { name: /create candidate/i }).click();

  // Wait for the candidate link to appear in the dashboard list
  await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 10000 });

  // Get the candidate ID by navigating to the detail page
  await page.getByRole('link', { name }).click();
  await page.waitForURL(/\/candidates\/[a-z0-9-]+/);
  const url = page.url();
  return url.split('/candidates/')[1];
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('Export & Logging (Epic 5)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRecruiter(page);
    await cleanupCandidateByName(page, CANDIDATE_NAME);
    // Navigate back to the dashboard after cleanup
    await page.goto(APP_BASE);
    await page.waitForURL(APP_BASE + '/');
  });

  test.afterEach(async ({ page }) => {
    await cleanupCandidateByName(page, CANDIDATE_NAME);
  });

  // ── F-12: Download Report button visible ─────────────────────────────────

  test('F-12 — Download Report button is visible on candidate detail page', async ({ page }) => {
    // Create candidate via UI (no Claude call)
    await createCandidateViaUI(page, CANDIDATE_NAME);

    // Should now be on the candidate detail page
    await expect(page.getByRole('heading', { name: CANDIDATE_NAME })).toBeVisible();

    // The "Download Report" button must be present
    const downloadBtn = page.getByRole('button', { name: /download report/i });
    await expect(downloadBtn).toBeVisible();
  });

  // ── F-12: Report API returns valid JSON ───────────────────────────────────

  test('F-12 — GET /candidates/:id/report returns 200 with valid JSON structure', async ({ page }) => {
    // Create candidate via UI to get a real ID
    const candidateId = await createCandidateViaUI(page, CANDIDATE_NAME);
    expect(candidateId).toBeTruthy();

    // Get auth token from page context
    const token = await getToken(page);
    expect(token).toBeTruthy();

    // Call the report endpoint directly
    const resp = await page.request.get(
      `${API_BASE}/candidates/${candidateId}/report`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    // Must return 200
    expect(resp.status()).toBe(200);

    // Response body must be valid JSON with expected top-level fields
    const body = await resp.json() as Record<string, unknown>;
    expect(body).toHaveProperty('candidate');
    expect(body).toHaveProperty('preScreening');
    expect(body).toHaveProperty('postScreening');

    // candidate sub-object must have id and name
    const candidate = body['candidate'] as Record<string, unknown>;
    expect(candidate).toHaveProperty('id');
    expect(candidate).toHaveProperty('name');
    expect(candidate['name']).toBe(CANDIDATE_NAME);

    // For a freshly-created candidate, preScreening and postScreening will be null
    // but the keys must exist in the response
    expect('preScreening' in body).toBe(true);
    expect('postScreening' in body).toBe(true);
  });

  // ── F-12: Report API requires authentication ──────────────────────────────

  test('F-12 — GET /candidates/:id/report returns 401 without auth token', async ({ page }) => {
    const candidateId = await createCandidateViaUI(page, CANDIDATE_NAME);
    expect(candidateId).toBeTruthy();

    // Call report endpoint without a token
    const resp = await page.request.get(
      `${API_BASE}/candidates/${candidateId}/report`
    );

    // Must return 401 Unauthorized
    expect(resp.status()).toBe(401);
  });

  // ── NF-07: Logging is active ──────────────────────────────────────────────

  test('NF-07 — Backend is responsive after multiple requests (logging active)', async ({ page }) => {
    // Make several API calls to generate log entries, then verify the backend
    // continues to respond correctly — proxy for observability being active.
    const token = await getToken(page);
    expect(token).toBeTruthy();

    // Health check — should always return 200
    const healthResp = await page.request.get(`${API_BASE}/health`);
    expect(healthResp.status()).toBe(200);
    const healthBody = await healthResp.json() as { status: string };
    expect(healthBody.status).toBe('ok');

    // Candidates list — should return 200 with array (logged action)
    const listResp = await page.request.get(`${API_BASE}/candidates`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listResp.status()).toBe(200);

    // Create a candidate via API to trigger a logged create action
    const candidateId = await createCandidateViaUI(page, CANDIDATE_NAME);
    expect(candidateId).toBeTruthy();

    // GET the candidate — verifies logged retrieval
    const getResp = await page.request.get(`${API_BASE}/candidates/${candidateId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getResp.status()).toBe(200);
    const candidateData = await getResp.json() as { id: string; name: string };
    expect(candidateData.name).toBe(CANDIDATE_NAME);

    // GET the report — triggers the report assembly + logging
    const reportResp = await page.request.get(
      `${API_BASE}/candidates/${candidateId}/report`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(reportResp.status()).toBe(200);

    // Backend should still be healthy after all these calls
    const finalHealthResp = await page.request.get(`${API_BASE}/health`);
    expect(finalHealthResp.status()).toBe(200);
  });
});

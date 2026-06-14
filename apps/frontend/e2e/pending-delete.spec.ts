/**
 * Epic 6 QA — pending + delete flow (no Claude API calls, no S3 required)
 *
 * Covers: F-13 (dashboard list), F-14 (status badge), F-18 (delete with confirm)
 *
 * Candidate C: "QA Pending — Delete Test"
 * - Created without CV so it stays Pending (no pre-screening triggered)
 * - Verified in dashboard list with Pending badge
 * - Deleted via Actions menu with confirmation dialog
 * - Candidate is intentionally cleaned up in afterEach
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsRecruiter } from './helpers/auth';

const CANDIDATE_NAME = 'QA Pending — Delete Test';

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

test.describe('Epic 6 QA — Pending + Delete (F-13, F-14, F-18)', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await loginAsRecruiter(page);
    // Idempotency: delete any pre-existing candidate with this name
    await cleanupCandidateByName(page, CANDIDATE_NAME);
  });

  test.afterEach(async ({ page }) => {
    // Belt-and-suspenders cleanup for Playwright retries
    await cleanupCandidateByName(page, CANDIDATE_NAME);
  });

  test('F-13, F-14: new candidate without CV appears in list with Pending badge', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    // Open "+ New Candidate" dialog
    await page.getByRole('button', { name: 'New Candidate' }).click();

    // Wait for dialog to open
    await expect(page.locator('#nc-name')).toBeVisible({ timeout: 5000 });

    // Fill name and position only — no CV/LinkedIn files (stays Pending)
    await page.fill('#nc-name', CANDIDATE_NAME);
    await page.fill('#nc-position', 'QA Engineer');

    // Submit
    await page.getByRole('button', { name: 'Create Candidate' }).click();

    // Wait for candidate link to appear in list (confirms dialog closed + list refreshed)
    await expect(page.getByRole('link', { name: CANDIDATE_NAME })).toBeVisible({ timeout: 15000 });

    // Row contains Pending badge (F-13: status badge visible; F-14: Pending for new candidate)
    // Use data-slot="badge" to target the badge span specifically, avoiding strict-mode conflict
    // with the candidate name link which also contains the word "Pending" as part of the name.
    const row = page.locator('tr').filter({ hasText: CANDIDATE_NAME });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.locator('[data-slot="badge"]', { hasText: 'Pending' })).toBeVisible();
  });

  test('F-18: delete candidate with confirmation dialog removes it from list', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    // Create candidate without CV so it stays Pending
    await page.getByRole('button', { name: 'New Candidate' }).click();
    await expect(page.locator('#nc-name')).toBeVisible({ timeout: 5000 });
    await page.fill('#nc-name', CANDIDATE_NAME);
    await page.fill('#nc-position', 'QA Engineer');
    await page.getByRole('button', { name: 'Create Candidate' }).click();
    await expect(page.getByRole('link', { name: CANDIDATE_NAME })).toBeVisible({ timeout: 15000 });

    // Locate the candidate row
    const row = page.locator('tr').filter({ hasText: CANDIDATE_NAME });
    await expect(row).toBeVisible({ timeout: 10000 });

    // Open Actions dropdown (button contains sr-only "Actions" span)
    const actionsBtn = row.locator('button').filter({
      has: page.locator('span.sr-only', { hasText: 'Actions' }),
    });
    await actionsBtn.click();

    // Click Delete in the dropdown menu (F-18: delete button in actions menu)
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    // Confirmation dialog must appear before deletion proceeds (F-18: confirmation required)
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('alertdialog')).toContainText('Delete candidate');

    // Confirm deletion
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

    // Row is removed from list (F-18: cascade delete confirmed)
    await expect(page.locator('tr').filter({ hasText: CANDIDATE_NAME })).not.toBeVisible({
      timeout: 10000,
    });
  });
});

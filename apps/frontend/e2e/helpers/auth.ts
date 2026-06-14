import { Page } from '@playwright/test';

/**
 * Shared login helper used by every spec.
 * LoginPage uses id="email" and id="password" (no name attributes).
 */
export async function loginAsRecruiter(page: Page) {
  await page.goto('http://localhost:5173/login');
  await page.fill('#email', 'recruiter@gorilla.com');
  await page.fill('#password', 'password123');
  await page.click('[type="submit"]');
  await page.waitForURL('http://localhost:5173/');
}

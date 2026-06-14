import { test, expect } from '@playwright/test';
import { loginAsRecruiter } from './helpers/auth';

/**
 * Epic 1 auth tests — covers F-19, F-20, F-21, F-22, F-23
 *
 * LoginPage.tsx uses id="email" and id="password" (no name attrs).
 * Submit button is type="submit" with text "Sign in".
 * Logout button in Navbar has text "Logout".
 * Protected routes use ProtectedRoute component → redirects to /login if !isAuthenticated.
 */

test.describe('F-22: /login page renders correctly', () => {
  test('login page has email and password fields and submit button', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    // Email input (id="email", type="email")
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#email')).toHaveAttribute('type', 'email');
    // Password input (id="password", type="password")
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');
    // Submit button
    await expect(page.locator('[type="submit"]')).toBeVisible();
    await expect(page.locator('[type="submit"]')).toContainText('Sign in');
  });
});

test.describe('F-20, F-22, F-23: valid login flow', () => {
  test('valid credentials redirect to dashboard', async ({ page }) => {
    // Clear any stored token first
    await page.goto('http://localhost:5173/login');
    await page.evaluate(() => localStorage.removeItem('auth_token'));

    await page.fill('#email', 'recruiter@gorilla.com');
    await page.fill('#password', 'password123');
    await page.click('[type="submit"]');

    // Should redirect to root dashboard (F-20: JWT returned + stored; F-22: redirected; F-23: seed user works)
    await page.waitForURL('http://localhost:5173/', { timeout: 10000 });
    await expect(page).toHaveURL('http://localhost:5173/');
  });

  test('F-23: seed user recruiter@gorilla.com with password123 authenticates successfully', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.evaluate(() => localStorage.removeItem('auth_token'));
    await page.fill('#email', 'recruiter@gorilla.com');
    await page.fill('#password', 'password123');
    await page.click('[type="submit"]');
    await page.waitForURL('http://localhost:5173/', { timeout: 10000 });

    // Verify JWT was stored in localStorage (F-20: JWT returned and saved)
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).not.toBeNull();
    expect(token!.length).toBeGreaterThan(10);
  });
});

test.describe('F-20: invalid credentials show error', () => {
  test('wrong password shows error message', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.evaluate(() => localStorage.removeItem('auth_token'));

    await page.fill('#email', 'recruiter@gorilla.com');
    await page.fill('#password', 'wrongpassword');
    await page.click('[type="submit"]');

    // Wait for error alert to appear (CardFooter > Alert)
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
    // Should stay on /login
    await expect(page).toHaveURL('http://localhost:5173/login');
  });

  test('non-existent user shows error message', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.evaluate(() => localStorage.removeItem('auth_token'));

    await page.fill('#email', 'nobody@example.com');
    await page.fill('#password', 'password123');
    await page.click('[type="submit"]');

    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL('http://localhost:5173/login');
  });
});

test.describe('F-21, F-22: protected routes redirect unauthenticated users', () => {
  test('visiting / without token redirects to /login', async ({ page }) => {
    // Ensure no token in storage
    await page.goto('http://localhost:5173/login');
    await page.evaluate(() => localStorage.removeItem('auth_token'));

    // Navigate directly to protected route
    await page.goto('http://localhost:5173/');
    // ProtectedRoute renders <Navigate to="/login" replace /> when !isAuthenticated
    await expect(page).toHaveURL('http://localhost:5173/login', { timeout: 10000 });
  });

  test('visiting any protected route without token redirects to /login', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    await page.evaluate(() => localStorage.removeItem('auth_token'));

    await page.goto('http://localhost:5173/candidates/some-id');
    await expect(page).toHaveURL('http://localhost:5173/login', { timeout: 10000 });
  });
});

test.describe('F-22: logout clears session and redirects', () => {
  test('logout button clears JWT and redirects to /login', async ({ page }) => {
    // Log in first
    await loginAsRecruiter(page);
    await expect(page).toHaveURL('http://localhost:5173/');

    // Navbar shows "Logout" button (Navbar.tsx: <Button>Logout</Button>)
    const logoutBtn = page.getByRole('button', { name: 'Logout' });
    await expect(logoutBtn).toBeVisible();

    // Click logout
    await logoutBtn.click();

    // Should redirect to /login
    await page.waitForURL('http://localhost:5173/login', { timeout: 10000 });
    await expect(page).toHaveURL('http://localhost:5173/login');

    // Token should be cleared from localStorage
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeNull();
  });

  test('after logout, protected route redirects to /login', async ({ page }) => {
    // Log in
    await loginAsRecruiter(page);
    await expect(page).toHaveURL('http://localhost:5173/');

    // Log out
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('http://localhost:5173/login', { timeout: 10000 });

    // Try to navigate back to protected route
    await page.goto('http://localhost:5173/');
    await expect(page).toHaveURL('http://localhost:5173/login', { timeout: 10000 });
  });
});

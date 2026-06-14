import { test, expect } from '@playwright/test'

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5173'
const EMAIL = process.env.TEST_EMAIL ?? 'admin@example.com'
const PASSWORD = process.env.TEST_PASSWORD ?? 'password123'

// Skip all tests when ANTHROPIC_API_KEY is not set — live Anthropic calls required
test.skip(!process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY not set')

async function login(page: Parameters<typeof test.beforeEach>[0]) {
  await page.goto(`${BASE_URL}/login`)
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE_URL}/`)
}

async function createCandidateAndRunPreScreen(
  page: Parameters<typeof test.beforeEach>[0]
): Promise<string> {
  // Open New Candidate dialog
  await page.click('button:has-text("New Candidate")')
  await page.fill('input[placeholder*="Name"]', 'Post Screen Candidate')
  await page.fill('input[placeholder*="Position"]', 'Software Engineer')

  // Upload a minimal CV file
  const cvContent = Buffer.from('Experienced software engineer with 5 years in backend development.')
  const [cvChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-testid="drop-zone"]').first().click(),
  ])
  await cvChooser.setFiles({
    name: 'cv.txt',
    mimeType: 'text/plain',
    buffer: cvContent,
  })

  await page.click('button:has-text("Create")')

  // Wait for navigation to the candidate detail page
  await page.waitForURL(/\/candidates\/[a-z0-9-]+/)
  const url = page.url()
  const candidateId = url.split('/candidates/')[1]

  // Wait for pre-screening to complete
  await page.waitForSelector('text=Pre-Screening', { timeout: 30000 })
  await page.waitForSelector('text=Profile Summary', { timeout: 60000 })

  return candidateId
}

test('run post-screening happy path', async ({ page }) => {
  await login(page)
  await createCandidateAndRunPreScreen(page)

  // Navigate to Post-Screening tab
  await page.click('button:has-text("Post-Screening")')
  await expect(page.locator('text=No post-screening data yet.')).toBeVisible()

  // Upload a transcript
  const transcript = Buffer.from(
    'Interviewer: Tell me about your distributed systems experience.\n' +
    'Candidate: I have 5 years of experience building microservices with Kubernetes.\n' +
    'Interviewer: How do you handle failures?\n' +
    'Candidate: I use circuit breakers and retry logic with exponential backoff.'
  )
  const [transcriptChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-testid="drop-zone"]').click(),
  ])
  await transcriptChooser.setFiles({
    name: 'transcript.txt',
    mimeType: 'text/plain',
    buffer: transcript,
  })

  await page.click('button:has-text("Run Post-Screening")')

  // Wait for AI recommendation to appear
  await page.waitForSelector('text=AI Recommendation', { timeout: 60000 })
  const passOrNoPass = page.locator('text=PASS, text=NO PASS').first()
  await expect(passOrNoPass).toBeVisible()
})

test('confirm decision — decided badge with "Confirmed by recruiter"', async ({ page }) => {
  await login(page)
  await createCandidateAndRunPreScreen(page)
  await page.click('button:has-text("Post-Screening")')

  const transcript = Buffer.from('Candidate demonstrated strong technical skills across all areas.')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-testid="drop-zone"]').click(),
  ])
  await chooser.setFiles({ name: 'transcript.txt', mimeType: 'text/plain', buffer: transcript })
  await page.click('button:has-text("Run Post-Screening")')
  await page.waitForSelector('text=AI Recommendation', { timeout: 60000 })

  // Click whichever "Confirm" button appears (Confirm Pass or Confirm No Pass)
  const confirmButton = page.locator('button').filter({ hasText: /^Confirm/ }).first()
  await confirmButton.click()

  // Decided badge and label should now be visible
  await expect(page.locator('text=Confirmed by recruiter')).toBeVisible({ timeout: 10000 })
})

test('override decision — decided badge with "Overridden by recruiter"', async ({ page }) => {
  await login(page)
  await createCandidateAndRunPreScreen(page)
  await page.click('button:has-text("Post-Screening")')

  const transcript = Buffer.from('Candidate answered all questions clearly and concisely.')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-testid="drop-zone"]').click(),
  ])
  await chooser.setFiles({ name: 'transcript.txt', mimeType: 'text/plain', buffer: transcript })
  await page.click('button:has-text("Run Post-Screening")')
  await page.waitForSelector('text=AI Recommendation', { timeout: 60000 })

  // Click whichever "Override" button appears
  const overrideButton = page.locator('button').filter({ hasText: /^Override/ }).first()
  await overrideButton.click()

  await expect(page.locator('text=Overridden by recruiter')).toBeVisible({ timeout: 10000 })
})

test('page refresh preserves decided state', async ({ page }) => {
  await login(page)
  const candidateId = await createCandidateAndRunPreScreen(page)
  await page.click('button:has-text("Post-Screening")')

  const transcript = Buffer.from('Detailed interview transcript showing strong performance.')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-testid="drop-zone"]').click(),
  ])
  await chooser.setFiles({ name: 'transcript.txt', mimeType: 'text/plain', buffer: transcript })
  await page.click('button:has-text("Run Post-Screening")')
  await page.waitForSelector('text=AI Recommendation', { timeout: 60000 })

  const confirmButton = page.locator('button').filter({ hasText: /^Confirm/ }).first()
  await confirmButton.click()
  await page.waitForSelector('text=Confirmed by recruiter', { timeout: 10000 })

  // Reload and verify decided state persists
  await page.reload()
  await page.waitForURL(`${BASE_URL}/candidates/${candidateId}`)

  // Navigate to Post-Screening tab (active tab may reset on reload)
  await page.click('button:has-text("Post-Screening")')
  await expect(page.locator('text=Confirmed by recruiter')).toBeVisible({ timeout: 10000 })
})

test('dashboard status shows decided badge with pass/no_pass color', async ({ page }) => {
  await login(page)
  await createCandidateAndRunPreScreen(page)
  await page.click('button:has-text("Post-Screening")')

  const transcript = Buffer.from('Candidate showed excellent skills throughout the interview.')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-testid="drop-zone"]').click(),
  ])
  await chooser.setFiles({ name: 'transcript.txt', mimeType: 'text/plain', buffer: transcript })
  await page.click('button:has-text("Run Post-Screening")')
  await page.waitForSelector('text=AI Recommendation', { timeout: 60000 })

  const confirmButton = page.locator('button').filter({ hasText: /^Confirm/ }).first()
  await confirmButton.click()
  await page.waitForSelector('text=Confirmed by recruiter', { timeout: 10000 })

  // Navigate back to dashboard
  await page.click('button:has-text("Candidates")')
  await page.waitForURL(`${BASE_URL}/`)

  // The candidate should show a Pass or No Pass badge (not just "Decided")
  const statusBadge = page.locator('table').locator('text=Pass, text=No Pass').first()
  await expect(statusBadge).toBeVisible({ timeout: 5000 })
})

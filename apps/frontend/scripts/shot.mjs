// 모의 서버(VITE_MOCK=1)로 사건 접수부터 3심 확정까지 실제 브라우저로 돌리며 화면을 저장하는 스크립트
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.env.URL ?? 'http://127.0.0.1:5291'
const out = process.env.SHOTS_DIR ?? 'test-results/shots'
// 실제 서버용 사건·대기 시간 (기본값은 모의 서버)
const JOB_TIMEOUT = Number(process.env.JOB_TIMEOUT ?? 40000)
const VARIANT_CASE = process.env.VARIANT_CASE ?? 'mock-002'
const MOBILE_CASE = process.env.MOBILE_CASE ?? 'mock-003'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] })
const errors = []

// 새 페이지 열고 콘솔 오류 수집
async function open(viewport, tag) {
  const page = await browser.newPage({ viewport })
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${tag}] ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`))
  return page
}

// 가로 스크롤이 생기는지 확인
async function checkOverflow(page, tag) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  if (w[0] > w[1]) errors.push(`[${tag}] 가로 스크롤 발생: ${w[0]} > ${w[1]}`)
}

// 장면이 자리 잡을 시간을 주고 저장
async function shot(page, name, wait = 900) {
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${out}/${name}.png` })
}

// 공개된 주장 카드가 n개 이상 될 때까지 대기
async function claimsShown(page, n, timeout = JOB_TIMEOUT) {
  await page.waitForFunction((k) => document.querySelectorAll('#sec-claims article').length >= k, n, { timeout })
}

// 원문 확인을 통과하지 못한 근거 기각 (판결 전 필수 단계)
async function ruleFailed(page) {
  const rows = page.locator('#sec-claims li').filter({ hasNot: page.getByText('원문 확인', { exact: true }) }).filter({ has: page.getByRole('button', { name: '기각' }) })
  for (const row of await rows.all()) {
    const struck = row.getByRole('button', { name: '기각' })
    if ((await struck.getAttribute('aria-pressed')) !== 'true') {
      await struck.click()
      await page.waitForTimeout(300)
    }
  }
}

// 자동 공개가 끝나 판사석 판결 폼이 열릴 때까지 대기 (실패 근거가 있으면 먼저 기각)
async function untilVerdict(page, label) {
  const verdict = page.getByRole('button', { name: label })
  const review = page.getByText('검증 실패 근거를 먼저 판정해 주세요')
  await verdict.or(review).first().waitFor({ timeout: JOB_TIMEOUT })
  if (await review.isVisible()) await ruleFailed(page)
  await verdict.waitFor({ timeout: JOB_TIMEOUT })
}

// 첫인상 기록
async function firstImpression(page) {
  await page.getByRole('radio', { name: '낚시성 (유죄)' }).click()
  await page.getByRole('button', { name: '첫인상 기록하고 개정' }).click()
}

// 판사석 하나 판결
async function seat(page, leaning, label, reason, report = false) {
  if (report) await page.getByLabel('재판연구관 보고서를 확인했습니다').check()
  await page.getByRole('radio', { name: leaning }).click()
  await page.locator('textarea').fill(reason)
  await page.getByRole('button', { name: label }).click()
  await page.waitForTimeout(300)
}

// 데스크톱 전체 흐름
async function desktop() {
  const page = await open({ width: 1440, height: 900 }, 'desktop')
  await page.goto(`${url}/cases`)
  await page.getByRole('link', { name: '재판 시작' }).first().waitFor()
  await shot(page, '01-docket', 500)
  await checkOverflow(page, 'docket')

  await page.getByRole('link', { name: '재판 시작' }).first().click()
  await page.waitForSelector('[data-scene="traditional-court"]')
  const caseId = new URL(page.url()).pathname.split('/').pop()
  await shot(page, '02-court-1-ready', 1500)

  await page.getByRole('button', { name: '재판 시작' }).click()
  await shot(page, '03-court-1-agents-working-h1', 2600)
  await firstImpression(page)
  await claimsShown(page, 2)
  await shot(page, '04-court-1-auto-reveal-mid', 100)
  await untilVerdict(page, '판결 기록')
  await shot(page, '05-court-1-all-revealed', 2500)
  await page.getByRole('button', { name: '기각' }).first().click()
  await page.getByRole('button', { name: /원문에서 보기/ }).nth(2).click()
  await shot(page, '06-court-1-ruled-focus', 2000)

  await seat(page, '낚시성 (유죄)', '판결 기록', '삽입된 게임 홍보 문장이 기사 주제와 무관하다고 판단함')
  await shot(page, '07-court-1-decision', 800)
  await page.getByRole('button', { name: /2심으로 항소/ }).click()
  await shot(page, '08-court-2-agents-working', 2800)
  await claimsShown(page, 3)
  await shot(page, '09-court-2-auto-reveal-mid', 100)

  // 심급 탭과 단계 칩 확인
  const tab = (n) => page.getByRole('list', { name: '심급 탭' }).getByRole('button').nth(n - 1)
  await tab(1).click()
  await shot(page, '10-tab-1-readonly', 900)
  await tab(3).click({ force: true })
  await shot(page, '11-tab-3-locked-note', 500)
  await tab(1).click()
  await tab(2).click()
  const chips = page.getByRole('list', { name: '판사 단계' }).getByRole('button')
  await chips.nth(0).click()
  await page.waitForTimeout(700)
  await chips.nth(1).click()
  await shot(page, '12-step-chip-verdict', 900)

  await untilVerdict(page, /판사석 1 판결 기록/)
  await shot(page, '13-court-2-all-revealed', 2500)
  await seat(page, '낚시성 (유죄)', /판사석 1 판결 기록/, '삽입 문장이 주제와 무관하다고 봅니다')
  await seat(page, '낚시성 아님 (무죄)', /판사석 2 판결 기록/, '제목 표현은 본문 사실이 뒷받침한다고 봅니다')
  await shot(page, '14-court-3-agents-working', 2800)

  await untilVerdict(page, /판사석 1 판결 기록/)
  await shot(page, '15-court-3-all-revealed', 2500)
  await seat(page, '낚시성 (유죄)', /판사석 1 판결 기록/, '연구관 보고서의 쟁점을 검토해 낚시성으로 판단', true)
  await seat(page, '낚시성 아님 (무죄)', /판사석 2 판결 기록/, '제목의 핵심이 본문에 나온다고 판단합니다')
  await seat(page, '낚시성 (유죄)', /판사석 3 판결 기록/, '삽입 문장 근거가 검증되어 낚시성으로 판단')
  await page.getByRole('radio', { name: /L1/ }).click()
  await shot(page, '16-court-3-decision', 800)
  await page.getByRole('button', { name: '최종 판결 확정' }).click()
  await shot(page, '17-court-3-final', 2500)
  await checkOverflow(page, 'court-final')

  for (const [path, name] of [[`/records/${caseId}`, '18-records'], ['/stats', '19-stats'], ['/progress', '21-progress']]) {
    await page.goto(`${url}${path}`)
    await page.waitForSelector('h1')
    await page.waitForLoadState('networkidle')
    await shot(page, name, 600)
    await checkOverflow(page, name)
  }

  await page.goto(`${url}/lab`)
  await shot(page, '22-lab-intro', 500)
  await page.getByRole('radio', { name: /조건 C/ }).click()
  await page.getByLabel('판사 이름').fill('실험판사')
  await page.getByRole('button', { name: '세션 시작' }).click()
  await page.getByRole('button', { name: '판결하기' }).first().click()
  await page.getByLabel('낚시성 여부').waitFor()
  await shot(page, '23-lab-judging', 600)
  await page.getByRole('radio', { name: '낚시성 (유죄)' }).click()
  await page.locator('textarea').fill('변론과 천칭을 보고 낚시성으로 판단합니다')
  await page.getByRole('button', { name: '판결 기록하고 정답 보기' }).click()
  await page.getByLabel('정답 공개').waitFor()
  await page.locator('select[aria-label="원본 사건"]').selectOption(VARIANT_CASE)
  await page.locator('select[aria-label="공격 방식"]').selectOption('inject_command')
  await page.getByRole('button', { name: '변형 사건 만들기' }).click()
  await page.waitForTimeout(1200)
  await shot(page, '24-lab-answer-variant-job', 300)
  await page.close()
}

// 통계실 폭별 배치 확인
async function statsWidths() {
  for (const w of [1200, 1440]) {
    const page = await open({ width: w, height: 900 }, `stats-${w}`)
    await page.goto(`${url}/stats`)
    await page.waitForSelector('section[aria-label="비용 · 성능"]')
    await page.screenshot({ path: `${out}/20-stats-${w}.png`, fullPage: true })
    await checkOverflow(page, `stats-${w}`)
    await page.close()
  }
}

// 모바일 사건 접수·법정 (저장된 1심 기록 재생)
async function mobile() {
  const page = await open({ width: 390, height: 844 }, 'mobile')
  await page.goto(`${url}/cases`)
  await page.getByRole('link', { name: '재판 시작' }).first().waitFor()
  await shot(page, '30-mobile-docket', 500)
  await checkOverflow(page, 'm-docket')
  await page.goto(`${url}/court/${MOBILE_CASE}`)
  await page.waitForSelector('[data-scene="traditional-court"]')
  await shot(page, '31-mobile-court-ready', 1500)
  await checkOverflow(page, 'm-court-ready')
  await page.getByRole('button', { name: '재판 시작' }).click()
  await firstImpression(page)
  await claimsShown(page, 2)
  await shot(page, '32-mobile-court-auto-reveal', 100)
  await untilVerdict(page, '판결 기록')
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot(page, '33-mobile-court-claims', 2500)
  await page.evaluate(() => window.scrollTo(0, 560))
  await shot(page, '34-mobile-court-scrolled', 600)
  await checkOverflow(page, 'm-court-claims')
  await page.close()
}

await desktop()
await statsWidths()
await mobile()
await browser.close()
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors')

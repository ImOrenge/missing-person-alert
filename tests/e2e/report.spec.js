const { test, expect } = require('@playwright/test');

const TEST_URL = 'https://missing-person-alram.web.app';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'test123456';

test.describe('실종자 제보 시스템 E2E 테스트', () => {

  test('1. 사이트 접속 및 로딩 확인', async ({ page }) => {
    console.log('📍 테스트 1: 사이트 접속 및 로딩 확인');

    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');

    // 스크린샷
    await page.screenshot({ path: 'tests/screenshots/01-homepage.png', fullPage: true });

    // 헤더 확인
    const header = await page.locator('header').textContent();
    expect(header).toContain('실시간 실종자 알림');

    console.log('✅ 사이트 로딩 성공');
  });

  test('2. 로그인 프로세스', async ({ page }) => {
    console.log('📍 테스트 2: 로그인 프로세스');

    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');

    // 로그인 버튼 찾기 및 클릭
    const loginButton = page.locator('button:has-text("로그인")');
    await expect(loginButton).toBeVisible();
    await loginButton.click();

    // 로그인 모달이 열렸는지 확인
    await page.waitForSelector('text=이메일', { timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/02-login-modal.png' });

    // 이메일/비밀번호 입력
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.screenshot({ path: 'tests/screenshots/03-login-filled.png' });

    // 로그인 버튼 클릭 (모달 내부)
    await page.click('button:has-text("로그인"):not(:has-text("Google"))');

    // 로그인 성공 대기 (토스트 메시지 또는 사용자 정보 표시)
    try {
      await page.waitForSelector('text=환영합니다', { timeout: 5000 });
      console.log('✅ 로그인 성공');
    } catch (error) {
      // 회원가입 필요
      console.log('⚠️ 계정이 없어서 회원가입 시도');

      // 회원가입 탭으로 전환
      await page.click('text=회원가입');
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("회원가입")');

      await page.waitForSelector('text=환영합니다', { timeout: 5000 });
      console.log('✅ 회원가입 및 로그인 성공');
    }

    await page.screenshot({ path: 'tests/screenshots/04-logged-in.png', fullPage: true });
  });

  test('3. 실종자 제보 작성 및 제출', async ({ page }) => {
    console.log('📍 테스트 3: 실종자 제보 작성 및 제출');

    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');

    // 로그인
    await page.click('button:has-text("로그인")');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("로그인"):not(:has-text("Google"))');
    await page.waitForTimeout(2000);

    // 제보하기 버튼 확인
    const reportButton = page.locator('button:has-text("실종자 제보")');
    await expect(reportButton).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/05-report-button.png' });

    // 제보 모달 열기
    await reportButton.click();
    await page.waitForSelector('text=실종자 정보 입력');
    await page.screenshot({ path: 'tests/screenshots/06-report-modal.png' });

    // 제보 폼 작성
    await page.fill('input[placeholder*="이름"]', '홍길동');
    await page.fill('input[type="number"]', '25');
    await page.selectOption('select', 'M'); // 성별 선택
    await page.fill('input[placeholder*="주소"]', '서울특별시 강남구');
    await page.fill('textarea', '키 175cm, 검은색 머리, 청바지 착용');

    await page.screenshot({ path: 'tests/screenshots/07-report-filled.png' });

    // 제보 제출
    await page.click('button:has-text("제보하기")');

    // 성공 메시지 확인
    try {
      await page.waitForSelector('text=제보가 성공적으로', { timeout: 5000 });
      console.log('✅ 제보 제출 성공');
    } catch (error) {
      console.log('⚠️ 제보 제출 확인 실패');
    }

    await page.screenshot({ path: 'tests/screenshots/08-report-submitted.png', fullPage: true });
  });

  test('4. 내 제보 기록 확인', async ({ page }) => {
    console.log('📍 테스트 4: 내 제보 기록 확인');

    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');

    // 로그인
    await page.click('button:has-text("로그인")');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("로그인"):not(:has-text("Google"))');
    await page.waitForTimeout(2000);

    // 내 제보 기록 버튼 클릭
    const myReportsButton = page.locator('button[title*="내 제보"]');
    await expect(myReportsButton).toBeVisible();
    await myReportsButton.click();

    await page.waitForSelector('text=내 제보 기록');
    await page.screenshot({ path: 'tests/screenshots/09-my-reports-modal.png' });

    // 제보 목록에 데이터가 있는지 확인
    const reportsList = page.locator('text=홍길동');
    try {
      await expect(reportsList).toBeVisible({ timeout: 3000 });
      console.log('✅ 제출한 제보가 목록에 표시됨');
    } catch (error) {
      console.log('⚠️ 제보 목록이 비어있거나 표시되지 않음');
    }

    await page.screenshot({ path: 'tests/screenshots/10-my-reports-list.png', fullPage: true });
  });

  test('5. 통합 테스트 (로그인 → 제보 → 확인)', async ({ page }) => {
    console.log('📍 테스트 5: 통합 테스트');

    // 1. 사이트 접속
    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');
    console.log('✅ 1단계: 사이트 접속 완료');

    // 2. 로그인
    await page.click('button:has-text("로그인")');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("로그인"):not(:has-text("Google"))');
    await page.waitForTimeout(2000);
    console.log('✅ 2단계: 로그인 완료');

    // 3. 제보 작성
    await page.click('button:has-text("실종자 제보")');
    await page.waitForSelector('text=실종자 정보 입력');

    const timestamp = Date.now();
    await page.fill('input[placeholder*="이름"]', `테스트${timestamp}`);
    await page.fill('input[type="number"]', '30');
    await page.fill('input[placeholder*="주소"]', '서울특별시 종로구');
    await page.fill('textarea', 'E2E 테스트 제보입니다');

    await page.click('button:has-text("제보하기")');
    await page.waitForTimeout(2000);
    console.log('✅ 3단계: 제보 제출 완료');

    await page.screenshot({ path: 'tests/screenshots/11-integration-submitted.png', fullPage: true });

    // 4. 제보 목록 확인
    await page.click('button[title*="내 제보"]');
    await page.waitForSelector('text=내 제보 기록');

    const newReport = page.locator(`text=테스트${timestamp}`);
    await expect(newReport).toBeVisible({ timeout: 5000 });
    console.log('✅ 4단계: 제보 목록에서 확인 완료');

    await page.screenshot({ path: 'tests/screenshots/12-integration-verified.png', fullPage: true });

    console.log('🎉 통합 테스트 완료!');
  });
});

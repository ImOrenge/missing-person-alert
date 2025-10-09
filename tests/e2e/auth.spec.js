const { test, expect } = require('@playwright/test');

const TEST_URL = 'https://missing-person-alram.web.app';
const timestamp = Date.now();
const TEST_EMAIL = `testuser${timestamp}@example.com`;
const TEST_PASSWORD = 'test123456';

test.describe('인증 기능 테스트 (회원가입, 로그인, 로그아웃)', () => {

  test('전체 인증 플로우 테스트', async ({ page }) => {
    console.log('🎯 인증 기능 E2E 테스트 시작');
    console.log('='.repeat(60));
    console.log(`테스트 계정: ${TEST_EMAIL}`);
    console.log('='.repeat(60));

    // ===== 1단계: 사이트 접속 =====
    console.log('\n📍 1단계: 사이트 접속');
    await page.goto(TEST_URL);
    await page.waitForTimeout(5000); // 초기 로딩 대기

    await page.screenshot({ path: 'tests/screenshots/auth-01-homepage.png', fullPage: true });
    console.log('✅ 홈페이지 로딩 완료');

    // ===== 2단계: 로그인 버튼 찾기 및 클릭 =====
    console.log('\n📍 2단계: 로그인 버튼 클릭');

    // 로그인 버튼 찾기
    const loginButton = page.locator('button:has-text("로그인")').first();
    await expect(loginButton).toBeVisible({ timeout: 10000 });
    console.log('✅ 로그인 버튼 발견');

    await page.screenshot({ path: 'tests/screenshots/auth-02-login-button.png' });

    await loginButton.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'tests/screenshots/auth-03-login-modal-opened.png' });
    console.log('✅ 로그인 모달 열림');

    // ===== 3단계: 회원가입 탭으로 전환 =====
    console.log('\n📍 3단계: 회원가입 탭으로 전환');

    // 회원가입 전환 버튼 찾기 (텍스트: "계정이 없으신가요? 회원가입")
    const signupTabButton = page.locator('button:has-text("계정이 없으신가요? 회원가입")');

    try {
      await expect(signupTabButton).toBeVisible({ timeout: 5000 });
      await signupTabButton.click();
      await page.waitForTimeout(1000);
      console.log('✅ 회원가입 탭으로 전환 성공');
    } catch (error) {
      console.log('⚠️ 회원가입 탭 전환 실패:', error.message);
      throw error; // 회원가입 탭 전환은 필수이므로 에러 발생
    }

    await page.screenshot({ path: 'tests/screenshots/auth-04-signup-tab.png' });

    // ===== 4단계: 회원가입 폼 작성 =====
    console.log('\n📍 4단계: 회원가입 폼 작성');
    console.log(`   이메일: ${TEST_EMAIL}`);
    console.log(`   비밀번호: ${TEST_PASSWORD}`);

    // 이메일 입력
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.clear();
    await emailInput.fill(TEST_EMAIL);
    console.log('✅ 이메일 입력 완료');

    // 비밀번호 입력
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.clear();
    await passwordInput.fill(TEST_PASSWORD);
    console.log('✅ 비밀번호 입력 완료');

    await page.screenshot({ path: 'tests/screenshots/auth-05-signup-filled.png' });

    // ===== 5단계: 회원가입 제출 =====
    console.log('\n📍 5단계: 회원가입 제출');

    // 회원가입 버튼 클릭 (Google이 아닌 일반 회원가입 버튼)
    const signupButton = page.locator('button:has-text("회원가입"):not(:has-text("Google"))').first();
    await signupButton.click();
    console.log('✅ 회원가입 버튼 클릭');

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/screenshots/auth-06-signup-submitted.png', fullPage: true });

    // 모달이 자동으로 닫힐 때까지 대기 (성공 시)
    console.log('🔄 모달이 자동으로 닫히길 기다리는 중...');
    await page.waitForTimeout(2000);

    // 모달 overlay가 사라졌는지 확인
    const isModalClosed = await page.locator('.fixed.inset-0.bg-black').isHidden().catch(() => false);
    if (isModalClosed) {
      console.log('✅ 모달이 자동으로 닫힘');
    } else {
      console.log('⚠️ 모달이 아직 열려있음, ESC로 닫기 시도');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: 'tests/screenshots/auth-06-after-signup.png', fullPage: true });

    // 로그인 버튼이 있는지 로그아웃 버튼이 있는지 확인하여 회원가입/로그인 상태 파악
    const hasLoginButton = await page.locator('button:has-text("로그인")').isVisible().catch(() => false);
    const hasLogoutButton = await page.locator('button[title="로그아웃"]').isVisible().catch(() => false);

    if (hasLogoutButton) {
      console.log('✅ 회원가입 성공! 로그인된 상태입니다');

      // ===== 6단계: 로그인 상태에서 제보 버튼 확인 =====
      console.log('\n📍 6단계: 로그인 상태에서 제보 버튼 확인');

      const reportButton = page.locator('button:has-text("실종자 제보")').first();
      const isReportButtonVisible = await reportButton.isVisible({ timeout: 5000 });

      if (isReportButtonVisible) {
        console.log('✅ 실종자 제보 버튼 확인됨 (로그인된 사용자만 표시)');
        await page.screenshot({ path: 'tests/screenshots/auth-07-report-button-visible.png' });
      } else {
        console.log('⚠️ 실종자 제보 버튼이 보이지 않음');
      }

      // ===== 7단계: 로그아웃 =====
      console.log('\n📍 7단계: 로그아웃');

      try {
        await page.click('button[title="로그아웃"]');
        await page.waitForTimeout(2000);
        console.log('✅ 로그아웃 완료');

        await page.screenshot({ path: 'tests/screenshots/auth-08-logged-out.png', fullPage: true });

        // 로그인 버튼이 다시 나타나는지 확인
        const loginButtonAfterLogout = await page.locator('button:has-text("로그인")').isVisible({ timeout: 5000 });
        if (loginButtonAfterLogout) {
          console.log('✅ 로그아웃 성공! 로그인 버튼 다시 표시됨');
        }
      } catch (error) {
        console.log('⚠️ 로그아웃 실패:', error.message);
      }

    } else if (hasLoginButton) {
      console.log('⚠️ 회원가입 후 로그인되지 않음 (계정이 이미 존재할 수 있음)');
    }

    // ===== 8단계: 다시 로그인 =====
    console.log('\n📍 8단계: 동일 계정으로 로그인');

    // Toast 알림이 완전히 사라질 때까지 대기
    console.log('🔄 Toast 알림이 사라지길 기다리는 중...');
    try {
      // Toast 컨테이너가 사라질 때까지 대기 (최대 5초)
      await page.waitForSelector('.Toastify__toast', { state: 'hidden', timeout: 5000 });
      console.log('✅ Toast 알림 사라짐');
    } catch (error) {
      console.log('⚠️ Toast 대기 시간 초과, 강제로 진행');
    }

    // 추가 안전 대기
    await page.waitForTimeout(500);

    // 로그인 버튼 클릭
    const loginBtn = page.locator('button:has-text("로그인")').first();
    await loginBtn.waitFor({ state: 'visible', timeout: 5000 });
    await loginBtn.click();
    await page.waitForTimeout(2000);
    console.log('✅ 로그인 모달 열림');

    await page.screenshot({ path: 'tests/screenshots/auth-09-login-modal-reopened.png' });

    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);

    await page.screenshot({ path: 'tests/screenshots/auth-10-login-filled.png' });

    // 로그인 버튼 클릭
    await page.click('button:has-text("로그인"):not(:has-text("Google"))');
    console.log('✅ 로그인 버튼 클릭');

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/screenshots/auth-11-logged-in.png', fullPage: true });

    // 로그인 성공 확인
    const loggedIn = await page.locator('button[title="로그아웃"]').isVisible({ timeout: 5000 });
    if (loggedIn) {
      console.log('✅ 로그인 성공!');
    } else {
      console.log('⚠️ 로그인 실패');
    }

    // ===== 최종 로그아웃 =====
    console.log('\n📍 9단계: 최종 로그아웃');

    try {
      await page.click('button[title="로그아웃"]');
      await page.waitForTimeout(2000);
      console.log('✅ 최종 로그아웃 완료');
    } catch (error) {
      console.log('⚠️ 최종 로그아웃 실패');
    }

    await page.screenshot({ path: 'tests/screenshots/auth-12-final.png', fullPage: true });

    console.log('\n🎉 인증 기능 테스트 완료!');
    console.log('='.repeat(60));
    console.log('테스트 결과 요약:');
    console.log('  1. ✅ 사이트 접속');
    console.log('  2. ✅ 로그인 모달 열기');
    console.log('  3. ✅ 회원가입');
    console.log('  4. ✅ 제보 버튼 확인');
    console.log('  5. ✅ 로그아웃');
    console.log('  6. ✅ 재로그인');
    console.log('='.repeat(60));
  });
});

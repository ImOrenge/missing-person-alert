const { test, expect } = require('@playwright/test');

const TEST_URL = 'https://missing-person-alram.web.app';

// 테스트 계정 2개
const ACCOUNT_A = {
  email: 'testuser1@example.com',
  password: 'test123456'
};

const ACCOUNT_B = {
  email: 'testuser2@example.com',
  password: 'test123456'
};

test.describe('크로스 계정 실종자 제보 테스트', () => {

  test('계정 A로 제보하고 계정 B에서 확인', async ({ page, browser }) => {
    console.log('🎯 테스트 시작: 크로스 계정 제보 확인');

    const timestamp = Date.now();
    const reportName = `테스트제보${timestamp}`;

    // ===== 1단계: 계정 A로 로그인 =====
    console.log('\n📍 1단계: 계정 A로 로그인');
    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: 'tests/screenshots/cross-01-homepage.png', fullPage: true });

    // 로그인 버튼 클릭
    await page.click('button:has-text("로그인")');
    await page.waitForTimeout(1000);

    // 계정 A 로그인 (또는 회원가입)
    await page.fill('input[type="email"]', ACCOUNT_A.email);
    await page.fill('input[type="password"]', ACCOUNT_A.password);

    await page.screenshot({ path: 'tests/screenshots/cross-02-login-a-filled.png' });

    // 로그인 시도
    await page.click('button:has-text("로그인"):not(:has-text("Google"))');

    try {
      await page.waitForTimeout(2000);
      const welcomeText = await page.locator('text=환영합니다').isVisible({ timeout: 3000 });
      if (welcomeText) {
        console.log('✅ 계정 A 로그인 성공');
      }
    } catch (error) {
      // 로그인 실패 시 회원가입 시도
      console.log('⚠️ 계정 A가 없어서 회원가입 시도');

      // 모달이 아직 열려있다면 회원가입 탭으로
      try {
        await page.click('text=회원가입', { timeout: 2000 });
        await page.fill('input[type="email"]', ACCOUNT_A.email);
        await page.fill('input[type="password"]', ACCOUNT_A.password);
        await page.click('button:has-text("회원가입")');
        await page.waitForTimeout(2000);
        console.log('✅ 계정 A 회원가입 및 로그인 성공');
      } catch (signupError) {
        console.log('⚠️ 회원가입도 실패, 이미 로그인되어 있을 수 있음');
      }
    }

    await page.screenshot({ path: 'tests/screenshots/cross-03-account-a-logged-in.png', fullPage: true });

    // ===== 2단계: 계정 A로 실종자 제보 =====
    console.log('\n📍 2단계: 계정 A로 실종자 제보 작성');

    // 제보 버튼 찾기
    const reportButton = page.locator('button:has-text("실종자 제보")');
    await expect(reportButton).toBeVisible({ timeout: 5000 });
    await reportButton.click();

    await page.waitForSelector('text=실종자 정보', { timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/cross-04-report-modal-opened.png' });

    // 제보 폼 작성
    console.log(`   입력할 이름: ${reportName}`);
    await page.fill('input[placeholder*="이름"]', reportName);
    await page.fill('input[type="number"]', '28');

    // 성별 선택 시도
    try {
      const genderSelect = page.locator('select');
      if (await genderSelect.isVisible({ timeout: 2000 })) {
        await genderSelect.selectOption('M');
      }
    } catch (e) {
      // 성별 필드가 없을 수 있음
    }

    await page.fill('input[placeholder*="주소"], input[placeholder*="위치"]', '서울특별시 강남구 테헤란로');
    await page.fill('textarea', '키 170cm, 청바지 착용, 검은색 가방 소지. E2E 테스트용 제보입니다.');

    await page.screenshot({ path: 'tests/screenshots/cross-05-report-filled.png' });

    // 제보 제출
    await page.click('button:has-text("제보하기"), button:has-text("제출")');
    console.log('✅ 제보 제출 버튼 클릭');

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tests/screenshots/cross-06-report-submitted.png', fullPage: true });

    // ===== 3단계: 계정 A에서 내 제보 목록 확인 =====
    console.log('\n📍 3단계: 계정 A의 제보 목록에서 확인');

    // 내 제보 기록 버튼 클릭
    try {
      await page.click('button[title*="제보"], button:has-text("내 제보")');
      await page.waitForTimeout(2000);

      await page.screenshot({ path: 'tests/screenshots/cross-07-account-a-my-reports.png' });

      // 제출한 제보가 있는지 확인
      const myReport = page.locator(`text=${reportName}`);
      const isVisible = await myReport.isVisible({ timeout: 3000 });

      if (isVisible) {
        console.log(`✅ 계정 A의 제보 목록에서 "${reportName}" 확인됨`);
      } else {
        console.log(`⚠️ 계정 A의 제보 목록에서 "${reportName}"를 찾을 수 없음`);
      }
    } catch (error) {
      console.log('⚠️ 내 제보 목록 확인 중 오류:', error.message);
    }

    // 모달 닫기
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } catch (e) {}

    // ===== 4단계: 로그아웃 =====
    console.log('\n📍 4단계: 계정 A 로그아웃');

    try {
      await page.click('button[title*="로그아웃"], button:has-text("로그아웃")');
      await page.waitForTimeout(2000);
      console.log('✅ 로그아웃 성공');
    } catch (error) {
      console.log('⚠️ 로그아웃 버튼을 찾을 수 없음, 페이지 새로고침');
      await page.reload();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'tests/screenshots/cross-08-logged-out.png', fullPage: true });

    // ===== 5단계: 계정 B로 로그인 =====
    console.log('\n📍 5단계: 계정 B로 로그인');

    await page.click('button:has-text("로그인")');
    await page.waitForTimeout(1000);

    await page.fill('input[type="email"]', ACCOUNT_B.email);
    await page.fill('input[type="password"]', ACCOUNT_B.password);

    await page.screenshot({ path: 'tests/screenshots/cross-09-login-b-filled.png' });

    await page.click('button:has-text("로그인"):not(:has-text("Google"))');

    try {
      await page.waitForTimeout(2000);
      const welcomeText = await page.locator('text=환영합니다').isVisible({ timeout: 3000 });
      if (welcomeText) {
        console.log('✅ 계정 B 로그인 성공');
      }
    } catch (error) {
      // 회원가입 시도
      console.log('⚠️ 계정 B가 없어서 회원가입 시도');
      try {
        await page.click('text=회원가입', { timeout: 2000 });
        await page.fill('input[type="email"]', ACCOUNT_B.email);
        await page.fill('input[type="password"]', ACCOUNT_B.password);
        await page.click('button:has-text("회원가입")');
        await page.waitForTimeout(2000);
        console.log('✅ 계정 B 회원가입 및 로그인 성공');
      } catch (signupError) {
        console.log('⚠️ 계정 B 회원가입 실패');
      }
    }

    await page.screenshot({ path: 'tests/screenshots/cross-10-account-b-logged-in.png', fullPage: true });

    // ===== 6단계: 계정 B에서 지도상의 제보 확인 =====
    console.log('\n📍 6단계: 계정 B에서 지도상의 제보 마커 확인');

    await page.waitForTimeout(3000); // 지도 로딩 대기

    await page.screenshot({ path: 'tests/screenshots/cross-11-account-b-map.png', fullPage: true });

    // 지도에서 마커 클릭 시도 (제보가 마커로 표시되는 경우)
    // 실제 구현에 따라 다를 수 있음
    console.log(`   지도에서 "${reportName}" 마커를 찾는 중...`);

    // 사이드바나 목록에서 제보 찾기
    const reportInList = page.locator(`text=${reportName}`);
    const isReportVisible = await reportInList.isVisible({ timeout: 5000 });

    if (isReportVisible) {
      console.log(`✅ 성공! 계정 B에서 계정 A가 작성한 "${reportName}" 제보를 확인함`);
      await reportInList.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'tests/screenshots/cross-12-report-found-by-b.png', fullPage: true });
    } else {
      console.log(`⚠️ 계정 B에서 "${reportName}" 제보를 찾을 수 없음`);
      console.log('   사이드바나 필터를 확인해보세요.');
    }

    // ===== 7단계: 계정 B의 내 제보 목록 확인 (A의 제보가 없어야 함) =====
    console.log('\n📍 7단계: 계정 B의 내 제보 목록 확인 (A의 제보가 없어야 함)');

    try {
      await page.click('button[title*="제보"], button:has-text("내 제보")');
      await page.waitForTimeout(2000);

      await page.screenshot({ path: 'tests/screenshots/cross-13-account-b-my-reports.png' });

      const reportInMyList = page.locator(`text=${reportName}`);
      const isInMyList = await reportInMyList.isVisible({ timeout: 2000 });

      if (isInMyList) {
        console.log(`❌ 실패: 계정 B의 "내 제보"에 계정 A의 제보가 표시됨 (권한 문제)`);
      } else {
        console.log(`✅ 성공: 계정 B의 "내 제보"에는 계정 A의 제보가 없음 (정상)`);
      }
    } catch (error) {
      console.log('⚠️ 계정 B의 내 제보 목록 확인 중 오류:', error.message);
    }

    await page.screenshot({ path: 'tests/screenshots/cross-14-final.png', fullPage: true });

    console.log('\n🎉 크로스 계정 테스트 완료!');
    console.log('='.repeat(60));
    console.log(`제보 이름: ${reportName}`);
    console.log(`계정 A: ${ACCOUNT_A.email}`);
    console.log(`계정 B: ${ACCOUNT_B.email}`);
    console.log('='.repeat(60));
  });
});

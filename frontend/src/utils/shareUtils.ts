/**
 * SNS별 실종자 정보 공유 유틸리티
 */

import { MissingPerson } from '../types';

export interface ShareOptions {
  person: MissingPerson;
  includeLocation?: boolean;
  includePhoto?: boolean;
  customMessage?: string;
}

const getMissingPersonPublicUrl = (personId: string): string => {
  const configuredOrigin = process.env.REACT_APP_PUBLIC_SITE_ORIGIN?.replace(/\/+$/, '');
  const origin = configuredOrigin || (process.env.NODE_ENV === 'production'
    ? 'https://missingalert.kr'
    : window.location.origin);
  return `${origin}/missing/${encodeURIComponent(personId)}`;
};

/**
 * 실종자 정보 기본 포맷
 */
interface BasicInfo {
  name: string;
  age: number;
  gender: string;
  type: string;
  location: string;
  date: string;
  description: string;
}

function getBasicInfo(person: MissingPerson): BasicInfo {
  const genderText = person.gender === 'M' ? '남성' : person.gender === 'F' ? '여성' : '미상';
  const typeText = getTypeText(person.type);
  const dateText = new Date(person.missingDate).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return {
    name: person.name,
    age: person.age,
    gender: genderText,
    type: typeText,
    location: person.location.address,
    date: dateText,
    description: person.description || '특이사항 없음'
  };
}

/**
 * 실종자 타입 텍스트 변환
 */
function getTypeText(type: string): string {
  const typeMap: Record<string, string> = {
    missing_child: '실종 아동',
    disabled: '장애인',
    dementia: '치매 환자',
    runaway: '가출인',
    facility: '시설보호자',
    unknown: '신원불상'
  };
  return typeMap[type] || '실종자';
}

/**
 * 1. 쓰레드(Threads) 공유 포맷
 * - 간결하고 읽기 쉬운 형식
 * - 해시태그 활용
 * - 최대 500자 권장
 */
export function generateThreadsFormat(options: ShareOptions): string {
  const info = getBasicInfo(options.person);

  return `🚨 실종자 정보 공유 🚨

${info.name}님을 찾습니다
📍 ${info.age}세 ${info.gender}
🏠 실종 지역: ${info.location}
📅 실종 일시: ${info.date}

${info.description}

💡 목격하신 분은 즉시 경찰(112) 또는 실종아동전문기관(182)으로 연락 부탁드립니다.

#실종자 #${info.type} #제보요청 #안전드림`;
}

/**
 * 2. X(트위터) 공유 포맷
 * - 280자 제한
 * - 핵심 정보만 간결하게
 * - 해시태그 필수
 */
export function generateXFormat(options: ShareOptions): string {
  const info = getBasicInfo(options.person);

  const core = `🚨 ${info.type} 제보요청
${info.name}님 (${info.age}세/${info.gender})
📍 ${info.location}
📅 ${info.date}
☎ 제보: 182

#실종자 #찾습니다 #제보`;

  // 280자 제한 체크
  return core.length > 280 ? core.substring(0, 277) + '...' : core;
}

/**
 * 3. 인스타그램 공유 포맷
 * - 스토리/피드용 긴 형식
 * - 이모지 활용
 * - 줄바꿈으로 가독성 향상
 */
export function generateInstagramFormat(options: ShareOptions): string {
  const info = getBasicInfo(options.person);

  return `🆘 실종자를 찾습니다 🆘

━━━━━━━━━━━━━━━━━━━━

👤 성함: ${info.name}
📊 나이: ${info.age}세
⚧ 성별: ${info.gender}
📂 구분: ${info.type}

━━━━━━━━━━━━━━━━━━━━

📍 실종 장소
${info.location}

📅 실종 일시
${info.date}

👕 특징
${info.description}

━━━━━━━━━━━━━━━━━━━━

💡 목격 정보 제보처
📞 경찰: 112
📞 안전드림: 182
🌐 www.safe182.go.kr

작은 제보가 가족을 만나게 합니다
공유 부탁드립니다 🙏

#실종자 #실종자찾기 #${info.type}
#제보요청 #안전드림 #찾습니다
#공유부탁 #나눔 #도움요청`;
}

/**
 * 4. 카카오톡 공유 포맷
 * - 메시지/오픈채팅용
 * - 친근한 말투
 * - 명확한 행동 유도
 */
export function generateKakaoFormat(options: ShareOptions): string {
  const info = getBasicInfo(options.person);

  return `[실종자 찾기 협조 요청]

안녕하세요.
${info.name}님(${info.age}세, ${info.gender})을 찾고 있습니다.

▪️ 실종 지역: ${info.location}
▪️ 실종 일시: ${info.date}
▪️ 특징: ${info.description}

혹시 목격하셨거나 관련 정보를 알고 계시다면
아래로 연락 부탁드립니다.

📞 긴급제보
- 경찰청: 112
- 안전드림(실종아동전문기관): 182

작은 정보라도 큰 도움이 됩니다.
주변에 공유 부탁드립니다. 감사합니다.`;
}

/**
 * 5. 페이스북 공유 포맷
 * - 긴 형식 지원
 * - 상세한 설명
 * - 공유 독려
 */
export function generateFacebookFormat(options: ShareOptions): string {
  const info = getBasicInfo(options.person);

  return `🚨 실종자 찾기에 도움을 주세요 🚨

━━━━━━━━━━━━━━━━━━━━━━━━

실종자 정보

이름: ${info.name}
나이: ${info.age}세
성별: ${info.gender}
구분: ${info.type}

━━━━━━━━━━━━━━━━━━━━━━━━

실종 정보

📍 실종 장소: ${info.location}
📅 실종 일시: ${info.date}

👤 외모 및 특징:
${info.description}

━━━━━━━━━━━━━━━━━━━━━━━━

💡 제보 방법

혹시 이 분을 목격하셨거나 관련 정보를 알고 계시다면 즉시 아래로 연락해 주세요.

📞 경찰청: 112
📞 실종아동전문기관(안전드림): 182
🌐 홈페이지: www.safe182.go.kr

━━━━━━━━━━━━━━━━━━━━━━━━

작은 관심이 소중한 생명을 구할 수 있습니다.
많은 공유 부탁드립니다. 🙏

#실종자 #실종자찾기 #제보요청 #공유부탁 #${info.type}`;
}

/**
 * 6. 이메일 공유 포맷
 */
export function generateEmailFormat(options: ShareOptions): { subject: string; body: string } {
  const info = getBasicInfo(options.person);

  return {
    subject: `[실종자 찾기 협조] ${info.name}님(${info.age}세)을 찾습니다`,
    body: `실종자 찾기 협조 요청

${info.name}님을 찾고 있습니다.

▪️ 나이: ${info.age}세
▪️ 성별: ${info.gender}
▪️ 구분: ${info.type}
▪️ 실종 지역: ${info.location}
▪️ 실종 일시: ${info.date}
▪️ 특징: ${info.description}

혹시 목격하셨거나 관련 정보를 알고 계시다면 아래로 연락 부탁드립니다.

제보처:
- 경찰청: 112
- 실종아동전문기관: 182
- 홈페이지: www.safe182.go.kr

작은 정보라도 큰 도움이 됩니다.
감사합니다.`
  };
}

/**
 * 7. SMS 공유 포맷 (짧은 버전)
 */
export function generateSMSFormat(options: ShareOptions): string {
  const info = getBasicInfo(options.person);

  return `[실종자 제보요청]
${info.name}(${info.age}세/${info.gender})
${info.location}에서 ${info.date} 실종
목격시 112 또는 182 제보`;
}

/**
 * 웹 공유 API를 위한 공유 데이터 생성
 */
export function generateWebShareData(options: ShareOptions): ShareData {
  const info = getBasicInfo(options.person);

  return {
    title: `실종자 찾기: ${info.name}님`,
    text: generateKakaoFormat(options), // 기본적으로 카카오톡 형식 사용
    url: getMissingPersonPublicUrl(options.person.id)
  };
}

/**
 * URL 공유를 위한 파라미터 생성
 */
export function generateShareUrls(options: ShareOptions) {
  const text = encodeURIComponent(generateKakaoFormat(options));
  const url = encodeURIComponent(getMissingPersonPublicUrl(options.person.id));
  return {
    // 카카오톡 (JavaScript SDK 필요)
    kakao: null, // SDK를 통해 직접 호출해야 함

    // 페이스북
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,

    // X (트위터)
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(generateXFormat(options))}&url=${url}`,

    // 라인
    line: `https://social-plugins.line.me/lineit/share?url=${url}`,

    // 텔레그램
    telegram: `https://t.me/share/url?url=${url}&text=${text}`,

    // 이메일
    email: (() => {
      const email = generateEmailFormat(options);
      return `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
    })(),

    // SMS (모바일만)
    sms: `sms:?body=${encodeURIComponent(generateSMSFormat(options))}`
  };
}

/**
 * SNS 타입 정의
 */
export type SNSType = 'threads' | 'x' | 'instagram' | 'kakao' | 'facebook' | 'email' | 'sms';

/**
 * SNS별 텍스트 가져오기
 */
export function getShareText(sns: SNSType, options: ShareOptions): string {
  switch (sns) {
    case 'threads':
      return generateThreadsFormat(options);
    case 'x':
      return generateXFormat(options);
    case 'instagram':
      return generateInstagramFormat(options);
    case 'kakao':
      return generateKakaoFormat(options);
    case 'facebook':
      return generateFacebookFormat(options);
    case 'sms':
      return generateSMSFormat(options);
    case 'email':
      return generateEmailFormat(options).body;
    default:
      return generateKakaoFormat(options);
  }
}

/**
 * 이미지를 Blob으로 변환
 */
async function fetchImageAsBlob(imageUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('이미지 로드 실패');
    return await response.blob();
  } catch (error) {
    console.error('이미지 변환 실패:', error);
    return null;
  }
}

/**
 * 텍스트와 이미지를 함께 클립보드에 복사
 */
export async function shareWithImage(
  text: string,
  imageUrl: string,
  altText: string = '실종자 사진'
): Promise<void> {
  try {
    // Clipboard API 지원 확인
    if (!navigator.clipboard || !navigator.clipboard.write) {
      throw new Error('Clipboard API 미지원');
    }

    // 이미지 다운로드
    const imageBlob = await fetchImageAsBlob(imageUrl);

    if (imageBlob) {
      // 텍스트와 이미지를 함께 클립보드에 복사
      const textBlob = new Blob([text], { type: 'text/plain' });
      const clipboardItem = new ClipboardItem({
        'text/plain': textBlob,
        [imageBlob.type]: imageBlob
      });

      await navigator.clipboard.write([clipboardItem]);
      console.log('✓ 텍스트와 이미지가 클립보드에 복사되었습니다');
    } else {
      // 이미지 로드 실패 시 텍스트만 복사
      await navigator.clipboard.writeText(text);
      console.log('✓ 텍스트만 클립보드에 복사되었습니다');
    }
  } catch (error) {
    console.error('공유 실패:', error);
    // 폴백: 텍스트만 복사
    await navigator.clipboard.writeText(text);
  }
}

/**
 * 이미지를 다운로드
 */
export function downloadImage(imageUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = filename;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

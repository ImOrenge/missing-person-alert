/**
 * 슈퍼계정(관리자) 관련 유틸리티
 */

// 관리자 이메일 목록
const ADMIN_EMAILS = [
  'admin@missing-person.com',
  'super@missing-person.com',
  'jmgi1024@gmail.com', // 메인 관리자
  // 추가 관리자 이메일
];

/**
 * 사용자가 관리자인지 확인
 */
export const isAdmin = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
};

/**
 * 사용자가 슈퍼관리자인지 확인 (UID 기반)
 */
export const isSuperAdmin = (uid: string | null | undefined): boolean => {
  if (!uid) return false;
  // 특정 UID를 슈퍼관리자로 지정 (Firebase Console에서 확인 가능)
  const SUPER_ADMIN_UIDS: string[] = [
    'hoq52Cn12QaeHiWrGqtvmHaa2xB2',
    // Firebase Console에서 생성한 관리자 계정의 UID를 여기에 추가
  ];
  return SUPER_ADMIN_UIDS.includes(uid);
};

/**
 * 관리자 권한 확인 (이메일 또는 UID)
 */
export const hasAdminAccess = (email: string | null | undefined, uid: string | null | undefined): boolean => {
  return isAdmin(email) || isSuperAdmin(uid);
};

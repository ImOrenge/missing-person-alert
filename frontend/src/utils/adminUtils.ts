import type { User } from 'firebase/auth';

export const ADMIN_ROLE_NAMES = ['reportModerator', 'seniorModerator', 'agencyOperator', 'privacyOfficer', 'systemAdmin'] as const;
export type AdminRole = typeof ADMIN_ROLE_NAMES[number];
export type AdminRoles = Readonly<Record<AdminRole, boolean>>;

export const EMPTY_ADMIN_ROLES: AdminRoles = Object.freeze({
  reportModerator: false,
  seniorModerator: false,
  agencyOperator: false,
  privacyOfficer: false,
  systemAdmin: false,
});

export const hasAnyAdminRole = (roles: AdminRoles): boolean =>
  ADMIN_ROLE_NAMES.some((role) => roles[role]);

export const getAdminRoles = async (user: User): Promise<AdminRoles> => {
  // 운영 역할 변경이 화면에 즉시 반영되도록 캐시된 ID 토큰을 강제 갱신한다.
  const token = await user.getIdTokenResult(true);
  return ADMIN_ROLE_NAMES.reduce((roles, role) => {
    roles[role] = token.claims[role] === true;
    return roles;
  }, { ...EMPTY_ADMIN_ROLES } as Record<AdminRole, boolean>);
};

/** 화면 표시용 관리자 여부다. 실제 권한은 모든 서버 요청에서 다시 검증한다. */
export const hasAdminAccess = async (user: User): Promise<boolean> => {
  return hasAnyAdminRole(await getAdminRoles(user));
};

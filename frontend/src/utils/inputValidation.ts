/**
 * 입력 검증 및 Sanitization 유틸리티
 */

// HTML 태그 제거
export const stripHtml = (input: string): string => {
  return input.replace(/<[^>]*>/g, '');
};

// XSS 방지를 위한 특수 문자 이스케이프
export const escapeHtml = (input: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return input.replace(/[&<>"']/g, (char) => map[char]);
};

// 입력 sanitization (HTML 제거 + 트림 + 줄바꿈 정규화)
export const sanitizeInput = (input: string): string => {
  return stripHtml(input)
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n'); // 3개 이상의 연속 줄바꿈을 2개로 제한
};

// 이름 검증
export const validateName = (name: string): { valid: boolean; error?: string } => {
  const sanitized = sanitizeInput(name);

  if (!sanitized) {
    return { valid: false, error: '이름을 입력해주세요' };
  }

  if (sanitized.length < 2) {
    return { valid: false, error: '이름은 최소 2자 이상이어야 합니다' };
  }

  if (sanitized.length > 50) {
    return { valid: false, error: '이름은 50자를 초과할 수 없습니다' };
  }

  // 특수문자 과다 사용 방지 (한글, 영문, 숫자, 공백, 일부 특수문자만 허용)
  const validNamePattern = /^[가-힣a-zA-Z0-9\s\-()]+$/;
  if (!validNamePattern.test(sanitized)) {
    return { valid: false, error: '이름에 허용되지 않는 문자가 포함되어 있습니다' };
  }

  return { valid: true };
};

// 나이 검증
export const validateAge = (age: number): { valid: boolean; error?: string } => {
  if (isNaN(age)) {
    return { valid: false, error: '유효한 나이를 입력해주세요' };
  }

  if (age < 0) {
    return { valid: false, error: '나이는 0 이상이어야 합니다' };
  }

  if (age > 150) {
    return { valid: false, error: '나이는 150 이하여야 합니다' };
  }

  return { valid: true };
};

// 설명 검증
export const validateDescription = (description: string): { valid: boolean; error?: string } => {
  const sanitized = sanitizeInput(description);

  if (!sanitized) {
    return { valid: false, error: '설명을 입력해주세요' };
  }

  if (sanitized.length < 10) {
    return { valid: false, error: '설명은 최소 10자 이상이어야 합니다' };
  }

  if (sanitized.length > 2000) {
    return { valid: false, error: '설명은 2000자를 초과할 수 없습니다' };
  }

  return { valid: true };
};

// 주소 검증
export const validateAddress = (address: string): { valid: boolean; error?: string } => {
  const sanitized = sanitizeInput(address);

  if (!sanitized) {
    return { valid: false, error: '주소를 입력해주세요' };
  }

  if (sanitized.length < 5) {
    return { valid: false, error: '주소는 최소 5자 이상이어야 합니다' };
  }

  if (sanitized.length > 200) {
    return { valid: false, error: '주소는 200자를 초과할 수 없습니다' };
  }

  return { valid: true };
};

// 전화번호 검증
export const validatePhoneNumber = (phone: string): { valid: boolean; error?: string } => {
  const sanitized = phone.replace(/\s+/g, '').replace(/-/g, '');

  if (!sanitized) {
    return { valid: false, error: '전화번호를 입력해주세요' };
  }

  // 한국 전화번호 형식 검증 (010-xxxx-xxxx, 02-xxx-xxxx 등)
  const phonePattern = /^(01[016789]|02|0[3-9][0-9])[0-9]{3,4}[0-9]{4}$/;
  if (!phonePattern.test(sanitized)) {
    return { valid: false, error: '유효한 전화번호 형식이 아닙니다' };
  }

  return { valid: true };
};

// 관계 검증
export const validateRelation = (relation: string): { valid: boolean; error?: string } => {
  const sanitized = sanitizeInput(relation);

  if (!sanitized) {
    return { valid: false, error: '관계를 입력해주세요' };
  }

  if (sanitized.length > 50) {
    return { valid: false, error: '관계는 50자를 초과할 수 없습니다' };
  }

  return { valid: true };
};

// 전체 폼 검증
export interface ReportFormData {
  name: string;
  age: number;
  gender: string;
  description: string;
  address: string;
  relation: string;
}

export const validateReportForm = (data: ReportFormData): { valid: boolean; errors: Record<string, string> } => {
  const errors: Record<string, string> = {};

  const nameValidation = validateName(data.name);
  if (!nameValidation.valid) {
    errors.name = nameValidation.error!;
  }

  const ageValidation = validateAge(data.age);
  if (!ageValidation.valid) {
    errors.age = ageValidation.error!;
  }

  const descValidation = validateDescription(data.description);
  if (!descValidation.valid) {
    errors.description = descValidation.error!;
  }

  const addressValidation = validateAddress(data.address);
  if (!addressValidation.valid) {
    errors.address = addressValidation.error!;
  }

  const relationValidation = validateRelation(data.relation);
  if (!relationValidation.valid) {
    errors.relation = relationValidation.error!;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Firebase Realtime Database NoSQL 스키마 정의
 *
 * 데이터 구조:
 * {
 *   missingPersons: {
 *     [id]: MissingPerson
 *   },
 *   archives: {
 *     [YYYY-MM-DD]: Archive
 *   }
 * }
 */

/**
 * 실종자 데이터 스키마
 */
const MissingPersonSchema = {
  id: {
    type: 'string',
    required: true,
    description: '실종자 고유 ID'
  },
  name: {
    type: 'string',
    required: true,
    minLength: 2,
    maxLength: 50,
    description: '실종자 이름'
  },
  age: {
    type: 'number',
    required: true,
    min: 0,
    max: 150,
    description: '실종자 나이'
  },
  gender: {
    type: 'string',
    required: true,
    enum: ['M', 'F', 'U'],
    description: '성별 (M: 남성, F: 여성, U: 미상)'
  },
  location: {
    type: 'object',
    required: true,
    schema: {
      lat: {
        type: 'number',
        required: true,
        min: -90,
        max: 90,
        description: '위도'
      },
      lng: {
        type: 'number',
        required: true,
        min: -180,
        max: 180,
        description: '경도'
      },
      address: {
        type: 'string',
        required: true,
        description: '실종 장소 주소'
      }
    },
    description: '실종 위치 정보'
  },
  photo: {
    type: 'string',
    required: false,
    nullable: true,
    description: '실종자 사진 URL'
  },
  description: {
    type: 'string',
    required: false,
    default: '특이사항 없음',
    description: '실종자 특징 및 설명'
  },
  missingDate: {
    type: 'string',
    required: true,
    description: '실종 일시 (ISO 8601 형식)'
  },
  type: {
    type: 'string',
    required: true,
    enum: ['missing_child', 'disabled', 'dementia'],
    description: '실종자 유형 (missing_child: 아동, disabled: 장애인, dementia: 치매)'
  },
  status: {
    type: 'string',
    required: true,
    enum: ['active', 'found', 'archived'],
    default: 'active',
    description: '실종자 상태'
  },
  height: {
    type: 'number',
    required: false,
    nullable: true,
    min: 0,
    max: 300,
    description: '실종자 키 (cm)'
  },
  weight: {
    type: 'number',
    required: false,
    nullable: true,
    min: 0,
    max: 500,
    description: '실종자 몸무게 (kg)'
  },
  clothes: {
    type: 'string',
    required: false,
    nullable: true,
    description: '실종 당시 옷차림'
  },
  updatedAt: {
    type: 'number',
    required: true,
    description: '데이터 업데이트 시간 (timestamp)'
  }
};

/**
 * 아카이브 데이터 스키마
 */
const ArchiveSchema = {
  timestamp: {
    type: 'number',
    required: true,
    description: '아카이브 생성 시간'
  },
  data: {
    type: 'object',
    required: true,
    description: '아카이브된 실종자 데이터 (key: id, value: MissingPerson)'
  },
  count: {
    type: 'number',
    required: true,
    min: 0,
    description: '아카이브된 데이터 개수'
  }
};

/**
 * 스키마 검증 함수
 */
function validateField(fieldName, value, schema) {
  const errors = [];

  // null 체크
  if (value === null || value === undefined) {
    if (schema.required && !schema.nullable) {
      errors.push(`${fieldName}은(는) 필수 항목입니다`);
    }
    return errors;
  }

  // 타입 체크
  const actualType = Array.isArray(value) ? 'array' : typeof value;
  if (actualType !== schema.type) {
    errors.push(`${fieldName}의 타입이 잘못되었습니다. 예상: ${schema.type}, 실제: ${actualType}`);
    return errors;
  }

  // 문자열 검증
  if (schema.type === 'string') {
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(`${fieldName}의 길이는 최소 ${schema.minLength}자 이상이어야 합니다`);
    }
    if (schema.maxLength && value.length > schema.maxLength) {
      errors.push(`${fieldName}의 길이는 최대 ${schema.maxLength}자 이하여야 합니다`);
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${fieldName}의 값은 다음 중 하나여야 합니다: ${schema.enum.join(', ')}`);
    }
  }

  // 숫자 검증
  if (schema.type === 'number') {
    if (schema.min !== undefined && value < schema.min) {
      errors.push(`${fieldName}은(는) ${schema.min} 이상이어야 합니다`);
    }
    if (schema.max !== undefined && value > schema.max) {
      errors.push(`${fieldName}은(는) ${schema.max} 이하여야 합니다`);
    }
  }

  // 객체 검증 (중첩 스키마)
  if (schema.type === 'object' && schema.schema) {
    Object.keys(schema.schema).forEach(key => {
      const nestedErrors = validateField(`${fieldName}.${key}`, value[key], schema.schema[key]);
      errors.push(...nestedErrors);
    });
  }

  return errors;
}

/**
 * 실종자 데이터 검증
 */
function validateMissingPerson(person) {
  const errors = [];

  Object.keys(MissingPersonSchema).forEach(key => {
    const fieldErrors = validateField(key, person[key], MissingPersonSchema[key]);
    errors.push(...fieldErrors);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 아카이브 데이터 검증
 */
function validateArchive(archive) {
  const errors = [];

  Object.keys(ArchiveSchema).forEach(key => {
    const fieldErrors = validateField(key, archive[key], ArchiveSchema[key]);
    errors.push(...fieldErrors);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 데이터 정규화 (기본값 설정 및 타입 변환)
 */
function normalizeMissingPerson(person) {
  const normalized = { ...person };

  // 기본값 설정
  if (!normalized.description) {
    normalized.description = MissingPersonSchema.description.default;
  }
  if (!normalized.status) {
    normalized.status = MissingPersonSchema.status.default;
  }

  // 타입 변환
  if (typeof normalized.age === 'string') {
    normalized.age = parseInt(normalized.age);
  }
  if (normalized.height && typeof normalized.height === 'string') {
    normalized.height = parseFloat(normalized.height);
  }
  if (normalized.weight && typeof normalized.weight === 'string') {
    normalized.weight = parseFloat(normalized.weight);
  }

  // updatedAt이 없으면 현재 시간으로 설정
  if (!normalized.updatedAt) {
    normalized.updatedAt = Date.now();
  }

  return normalized;
}

/**
 * 스키마 문서 생성 (개발용)
 */
function generateSchemaDoc() {
  const doc = {
    title: 'Firebase Realtime Database NoSQL Schema',
    version: '1.0.0',
    schemas: {
      MissingPerson: MissingPersonSchema,
      Archive: ArchiveSchema
    }
  };

  return JSON.stringify(doc, null, 2);
}

module.exports = {
  MissingPersonSchema,
  ArchiveSchema,
  validateMissingPerson,
  validateArchive,
  normalizeMissingPerson,
  generateSchemaDoc
};

import { create } from 'zustand';
import { MissingPerson, EmergencyMessage, FilterState, TimeRange } from '../types';

interface EmergencyStore {
  // 상태
  missingPersons: MissingPerson[];
  emergencyMessages: EmergencyMessage[];
  filters: FilterState;
  isConnected: boolean;
  selectedPersonId: string | null;
  hoveredPersonId: string | null;

  // 액션
  addMissingPerson: (person: MissingPerson) => void;
  addMissingPersons: (persons: MissingPerson[]) => void;
  addEmergencyMessage: (message: EmergencyMessage) => void;
  updateFilters: (filters: Partial<FilterState>) => void;
  setConnectionStatus: (status: boolean) => void;
  setSelectedPersonId: (id: string | null) => void;
  setHoveredPersonId: (id: string | null) => void;
  getFilteredPersons: () => MissingPerson[];
  clearAllData: () => void;
  removeDuplicates: () => void;
}

// 시간 범위를 밀리초로 변환
function parseTimeRange(range: TimeRange): number {
  switch (range) {
    case '24h':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
    case '60d':
      return 60 * 24 * 60 * 60 * 1000;
    case '90d':
      return 90 * 24 * 60 * 60 * 1000;
    case '1y':
      return 365 * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
}

export const useEmergencyStore = create<EmergencyStore>((set, get) => ({
  // 초기 상태
  missingPersons: [],
  emergencyMessages: [],
  filters: {
    regions: [],
    types: ['missing_child', 'disabled', 'dementia'],
    timeRange: '30d' // 기본값: 30일
  },
  isConnected: false,
  selectedPersonId: null,
  hoveredPersonId: null,

  // 실종자 1명 추가
  addMissingPerson: (person) => {
    set((state) => {
      // 중복 체크
      const exists = state.missingPersons.some(p => p.id === person.id);
      if (exists) {
        console.log(`실종자 ${person.id}는 이미 존재합니다`);
        return state;
      }

      return {
        missingPersons: [person, ...state.missingPersons]
      };
    });
  },

  // 실종자 여러 명 추가 (배치)
  addMissingPersons: (persons) => {
    set((state) => {
      const existingIds = new Set(state.missingPersons.map(p => p.id));
      const existingFingerprints = new Set(
        state.missingPersons.map(p => `${p.name}_${p.age}_${p.gender}`)
      );

      const newPersons = persons.filter(p => {
        const fingerprint = `${p.name}_${p.age}_${p.gender}`;

        // ID와 지문(이름+나이+성별) 모두 체크
        if (existingIds.has(p.id)) {
          console.log(`중복 제외 (ID): ${p.name} (${p.id})`);
          return false;
        }

        if (existingFingerprints.has(fingerprint)) {
          console.log(`중복 제외 (지문): ${p.name} (${fingerprint})`);
          return false;
        }

        return true;
      });

      if (newPersons.length === 0) {
        console.log('모든 항목이 중복되어 추가되지 않음');
        return state;
      }

      console.log(`${newPersons.length}명의 새로운 실종자 추가됨`);

      return {
        missingPersons: [...newPersons, ...state.missingPersons]
      };
    });
  },

  // 긴급재난문자 추가
  addEmergencyMessage: (message) => {
    set((state) => {
      // 중복 체크
      const exists = state.emergencyMessages.some(m => m.id === message.id);
      if (exists) {
        return state;
      }

      return {
        emergencyMessages: [message, ...state.emergencyMessages]
      };
    });
  },

  // 필터 업데이트
  updateFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters }
    }));
  },

  // 연결 상태 업데이트
  setConnectionStatus: (status) => {
    set({ isConnected: status });
  },

  // 선택된 실종자 ID 설정
  setSelectedPersonId: (id) => {
    set({ selectedPersonId: id });
  },

  // 호버된 실종자 ID 설정
  setHoveredPersonId: (id) => {
    set({ hoveredPersonId: id });
  },

  // 필터링된 실종자 목록 가져오기
  getFilteredPersons: () => {
    const { missingPersons, filters } = get();

    return missingPersons.filter((person) => {
      // 지역 필터
      if (filters.regions.length > 0) {
        const personRegion = person.location.address.split(' ')[0];
        if (!filters.regions.includes(personRegion)) {
          return false;
        }
      }

      // 유형 필터
      if (!filters.types.includes(person.type)) {
        return false;
      }

      // 시간 필터
      if (filters.timeRange !== 'all') {
        const cutoffTime = Date.now() - parseTimeRange(filters.timeRange);
        const missingTime = new Date(person.missingDate).getTime();
        if (missingTime < cutoffTime) {
          return false;
        }
      }

      return true;
    });
  },

  // 모든 데이터 초기화
  clearAllData: () => {
    set({
      missingPersons: [],
      emergencyMessages: []
    });
    console.log('✅ 모든 데이터가 초기화되었습니다');
  },

  // 중복 데이터 제거
  removeDuplicates: () => {
    set((state) => {
      const seen = new Map<string, MissingPerson>();

      state.missingPersons.forEach((person) => {
        const fingerprint = `${person.name}_${person.age}_${person.gender}`;

        if (!seen.has(fingerprint) && !seen.has(person.id)) {
          seen.set(person.id, person);
          seen.set(fingerprint, person);
        }
      });

      const uniquePersons = Array.from(new Set(Array.from(seen.values())));
      const removedCount = state.missingPersons.length - uniquePersons.length;

      console.log(`🧹 중복 ${removedCount}건 제거됨`);

      return {
        missingPersons: uniquePersons
      };
    });
  }
}));

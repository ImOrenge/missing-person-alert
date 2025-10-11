import React, { useState, useEffect } from 'react';
import { useEmergencyStore } from '../stores/emergencyStore';
import { MissingPersonType } from '../types';
import { toast } from 'react-toastify';
import { getAuth } from 'firebase/auth';
import { loadRecaptchaScript, executeRecaptcha } from '../utils/recaptcha';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReportModal({ isOpen, onClose }: Props) {
  const addMissingPerson = useEmergencyStore((state) => state.addMissingPerson);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecaptchaReady, setIsRecaptchaReady] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'M',
    type: 'missing_child' as MissingPersonType,
    address: '',
    region: '서울특별시',
    description: '',
    photo: ''
  });

  // reCAPTCHA 초기화 (execute는 호출하지 않음)
  useEffect(() => {
    const initRecaptcha = async () => {
      try {
        await loadRecaptchaScript();
        setIsRecaptchaReady(true);
        console.log('✅ reCAPTCHA Enterprise 준비 완료 (백엔드에서 자동 검증)');
      } catch (error) {
        console.warn('⚠️ reCAPTCHA 초기화 실패:', error);
        setIsRecaptchaReady(true); // 실패해도 제보는 가능하도록
      }
    };

    if (isOpen) {
      initRecaptcha();
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 중복 제출 방지
    if (isSubmitting) {
      return;
    }

    // 필수 필드 검증
    if (!formData.name || !formData.age || !formData.address) {
      toast.error('이름, 나이, 실종 장소는 필수 입력 항목입니다');
      return;
    }

    // 로그인 확인
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      toast.error('로그인이 필요합니다');
      return;
    }

    setIsSubmitting(true);

    try {
      // reCAPTCHA 토큰 생성
      let recaptchaToken = '';
      try {
        recaptchaToken = await executeRecaptcha('report_submit');
      } catch (error) {
        console.warn('⚠️ reCAPTCHA 토큰 생성 실패:', error);
        toast.error('보안 인증에 실패했습니다. 다시 시도해주세요.');
        setIsSubmitting(false);
        return;
      }

      // 실종자 데이터 생성
      const personData = {
        name: formData.name,
        age: parseInt(formData.age),
        gender: formData.gender,
        location: {
          lat: 37.5665, // 백엔드에서 주소로 좌표 변환
          lng: 126.9780,
          address: `${formData.region} ${formData.address}`
        },
        photo: formData.photo || undefined,
        description: formData.description || '특이사항 없음',
        type: formData.type
      };

      // API 호출
      const token = await user.getIdToken();
      const apiUrl = `${process.env.REACT_APP_API_URL || ''}/api/reports`;
      console.log('📡 제보 등록:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-recaptcha-token': recaptchaToken
        },
        body: JSON.stringify({
          person: personData,
          uid: user.uid
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '제보 등록에 실패했습니다');
      }

      // 로컬 스토어에도 추가
      addMissingPerson(data.report);

      // 성공 알림
      toast.success('실종자 제보가 성공적으로 등록되었습니다');

      // 폼 리셋
      setFormData({
        name: '',
        age: '',
        gender: 'M',
        type: 'missing_child',
        address: '',
        region: '서울특별시',
        description: '',
        photo: ''
      });

      // 모달 닫기
      onClose();
    } catch (error: any) {
      console.error('제보 등록 실패:', error);
      toast.error(error.message || '제보 등록 중 오류가 발생했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '30px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', color: '#2c3e50' }}>실종자 제보</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#95a5a6'
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 실종자 기본 정보 */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#34495e' }}>실종자 정보</h3>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                이름 <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                  나이 <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  required
                  min="0"
                  max="120"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                  성별
                </label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    fontSize: '14px'
                  }}
                >
                  <option value="M">남성</option>
                  <option value="F">여성</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                유형
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
              >
                <option value="missing_child">실종 아동</option>
                <option value="runaway">가출인</option>
                <option value="disabled">지적장애인</option>
                <option value="dementia">치매환자</option>
                <option value="facility">시설보호자</option>
                <option value="unknown">신원불상</option>
              </select>
            </div>
          </div>

          {/* 실종 위치 */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#34495e' }}>실종 위치</h3>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                시도 선택
              </label>
              <select
                name="region"
                value={formData.region}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
              >
                <option>서울특별시</option>
                <option>부산광역시</option>
                <option>대구광역시</option>
                <option>인천광역시</option>
                <option>광주광역시</option>
                <option>대전광역시</option>
                <option>울산광역시</option>
                <option>세종특별자치시</option>
                <option>경기도</option>
                <option>강원도</option>
                <option>충청북도</option>
                <option>충청남도</option>
                <option>전라북도</option>
                <option>전라남도</option>
                <option>경상북도</option>
                <option>경상남도</option>
                <option>제주특별자치도</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                상세 주소 <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                required
                placeholder="예: 중구 명동길 123"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          {/* 신체 특징 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
              신체 특징 / 착용 의상
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              placeholder="예: 키 150cm, 검은색 패딩, 청바지 착용"
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
          </div>

          {/* 사진 URL */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
              사진 URL (선택사항)
            </label>
            <input
              type="url"
              name="photo"
              value={formData.photo}
              onChange={handleChange}
              placeholder="https://example.com/photo.jpg"
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '14px'
              }}
            />
          </div>

          {/* 보안 안내 */}
          <div style={{
            marginBottom: '20px',
            padding: '12px',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #e9ecef'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '18px' }}>🔒</span>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>보안 안내</span>
            </div>
            <ul style={{
              margin: '0',
              paddingLeft: '20px',
              fontSize: '12px',
              color: '#6c757d',
              lineHeight: '1.6'
            }}>
              <li>전화번호 SMS 인증이 완료되어야 제보가 가능합니다</li>
              <li>reCAPTCHA로 자동입력이 방지됩니다</li>
              <li>제보 정보는 안전하게 암호화되어 저장됩니다</li>
              <li>허위 제보 시 법적 책임을 질 수 있습니다</li>
            </ul>
            {isRecaptchaReady && (
              <div style={{
                marginTop: '8px',
                fontSize: '11px',
                color: '#6c757d',
                fontStyle: 'italic'
              }}>
                이 사이트는 reCAPTCHA로 보호되며 Google{' '}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>
                  개인정보 보호정책
                </a>
                {' '}및{' '}
                <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>
                  서비스 약관
                </a>
                이 적용됩니다.
              </div>
            )}
          </div>

          {/* 제출 버튼 */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                backgroundColor: 'white',
                color: '#333',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isSubmitting ? '#95a5a6' : '#e74c3c',
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1
              }}
            >
              {isSubmitting ? '제보 중...' : '제보하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

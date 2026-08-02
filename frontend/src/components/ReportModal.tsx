import React, { useState, useEffect, useRef } from 'react';
import { useEmergencyStore } from '../stores/emergencyStore';
import { MissingPersonType } from '../types';
import { toast } from 'react-toastify';
import { getAuth } from 'firebase/auth';
import { loadRecaptchaScript, executeRecaptcha } from '../utils/recaptcha';
import { loadGoogleMapsScript } from '../utils/googleMapsLoader';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isPage?: boolean;
}

type LocationSelection = {
  address: string;
  lat: number;
  lng: number;
};

interface LocationSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: LocationSelection) => void;
  initialQuery?: string;
}

const LocationSearchModal: React.FC<LocationSearchModalProps> = ({ isOpen, onClose, onSelect, initialQuery = '' }) => {
  const [query, setQuery] = useState(initialQuery);
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [servicesReady, setServicesReady] = useState(false);

  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const googleInstanceRef = useRef<typeof google | null>(null);
  const hiddenContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setServicesReady(false);
    let mounted = true;

    loadGoogleMapsScript()
      .then((googleMaps) => {
        if (!mounted) return;

        googleInstanceRef.current = googleMaps;
        autocompleteServiceRef.current = new googleMaps.maps.places.AutocompleteService();

        if (!hiddenContainerRef.current) {
          const container = document.createElement('div');
          container.style.display = 'none';
          document.body.appendChild(container);
          hiddenContainerRef.current = container;
        }

        placesServiceRef.current = new googleMaps.maps.places.PlacesService(hiddenContainerRef.current!);
        setServicesReady(true);
        setErrorMessage(null);
      })
      .catch((error) => {
        console.error('Google Places 서비스 초기화 실패:', error);
        setErrorMessage('주소 검색 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        setServicesReady(false);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setQuery(initialQuery || '');
    setPredictions([]);
    setErrorMessage(null);
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      if (initialQuery) {
        inputRef.current.select();
      }
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen || !servicesReady) {
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setLoading(false);
      setPredictions([]);
      setErrorMessage(null);
      return;
    }

    setLoading(true);
    const handler = window.setTimeout(() => {
      const autocomplete = autocompleteServiceRef.current;
      const googleMaps = googleInstanceRef.current;
      if (!autocomplete || !googleMaps) {
        setLoading(false);
        setPredictions([]);
        setErrorMessage('자동완성 서비스를 사용할 수 없습니다.');
        return;
      }

      autocomplete.getPlacePredictions(
        {
          input: trimmed,
          componentRestrictions: { country: ['kr'] },
          types: ['geocode']
        },
        (results, status) => {
          if (!isOpen) {
            return;
          }

          setLoading(false);

          if (status !== googleMaps.maps.places.PlacesServiceStatus.OK || !results) {
            setPredictions([]);
            if (status === googleMaps.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
              setErrorMessage('검색 결과가 없습니다. 다른 키워드를 입력해보세요.');
            } else {
              setErrorMessage('주소를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
            }
            return;
          }

          setPredictions(results);
          setErrorMessage(null);
        }
      );
    }, 250);

    return () => {
      window.clearTimeout(handler);
    };
  }, [isOpen, query, servicesReady]);

  useEffect(() => {
    return () => {
      if (hiddenContainerRef.current) {
        document.body.removeChild(hiddenContainerRef.current);
        hiddenContainerRef.current = null;
      }
    };
  }, []);

  const handleSelectPrediction = (prediction: google.maps.places.AutocompletePrediction) => {
    const googleMaps = googleInstanceRef.current;
    const placesService = placesServiceRef.current;

    if (!googleMaps || !placesService) {
      setErrorMessage('장소 세부 정보를 불러올 수 없습니다.');
      return;
    }

    setLoading(true);
    placesService.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['formatted_address', 'geometry']
      },
      (place, status) => {
        setLoading(false);

        if (
          status !== googleMaps.maps.places.PlacesServiceStatus.OK ||
          !place ||
          !place.geometry ||
          !place.geometry.location
        ) {
          setErrorMessage('선택한 장소 정보를 불러오지 못했습니다. 다시 시도해주세요.');
          return;
        }

        onSelect({
          address: place.formatted_address || prediction.description,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        });
        setQuery('');
        setPredictions([]);
        onClose();
      }
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '80vh',
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#2c3e50' }}>실종 위치 검색</h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '22px',
              color: '#95a5a6',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: 서울특별시 중구 명동길 123"
          disabled={!servicesReady}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #ddd',
            fontSize: '14px',
            marginBottom: '10px',
            backgroundColor: servicesReady ? 'white' : '#f1f3f5',
            color: servicesReady ? '#2c3e50' : '#95a5a6'
          }}
        />

        <div style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '12px' }}>
          {servicesReady
            ? '검색어를 입력하면 하단에 자동완성 목록이 표시됩니다. 주소를 선택하면 지도 좌표가 자동으로 등록됩니다.'
            : '주소 검색 서비스를 준비 중입니다...'}
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            border: '1px solid #e9ecef',
            borderRadius: '8px',
            padding: '8px',
            backgroundColor: '#fbfbfb'
          }}
        >
          {loading && (
            <div style={{ fontSize: '13px', color: '#7f8c8d', padding: '8px' }}>검색 중...</div>
          )}

          {!loading && predictions.length === 0 && query.trim() && !errorMessage && (
            <div style={{ fontSize: '13px', color: '#7f8c8d', padding: '8px' }}>검색 결과가 없습니다.</div>
          )}

          {errorMessage && (
            <div style={{ fontSize: '13px', color: '#e74c3c', padding: '8px' }}>{errorMessage}</div>
          )}

          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onClick={() => handleSelectPrediction(prediction)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px',
                border: 'none',
                backgroundColor: 'white',
                borderRadius: '6px',
                marginBottom: '6px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
              }}
            >
              <div style={{ fontSize: '14px', color: '#2c3e50', marginBottom: '4px' }}>{prediction.structured_formatting.main_text}</div>
              <div style={{ fontSize: '12px', color: '#7f8c8d' }}>{prediction.structured_formatting.secondary_text || prediction.description}</div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: '6px',
              border: '1px solid #ddd',
              backgroundColor: 'white',
              color: '#333',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

const createInitialFormState = () => ({
  name: '',
  age: '',
  gender: 'M',
  type: 'missing_child' as MissingPersonType,
  description: '',
  photo: ''
});

export default function ReportModal({ isOpen, onClose, isPage = false }: Props) {
  const addMissingPerson = useEmergencyStore((state) => state.addMissingPerson);
  const enqueueNewPersonAlert = useEmergencyStore((state) => state.enqueueNewPersonAlert);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecaptchaReady, setIsRecaptchaReady] = useState(false);

  const [formData, setFormData] = useState(createInitialFormState);
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);

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

  useEffect(() => {
    if (!isOpen) {
      setFormData(createInitialFormState());
      setAddress('');
      setLatitude(null);
      setLongitude(null);
      setShowLocationModal(false);
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleOpenLocationModal = () => {
    setShowLocationModal(true);
  };

  const handleCloseLocationModal = () => {
    setShowLocationModal(false);
  };

  const handleLocationSelect = (selection: LocationSelection) => {
    setAddress(selection.address);
    setLatitude(selection.lat);
    setLongitude(selection.lng);
    setShowLocationModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 중복 제출 방지
    if (isSubmitting) {
      return;
    }

    // 필수 필드 검증
    if (!formData.name || !formData.age) {
      toast.error('이름과 나이를 입력해주세요');
      return;
    }

    if (!address.trim()) {
      toast.error('실종 장소를 검색하여 선택해주세요');
      return;
    }

    if (latitude === null || longitude === null) {
      toast.error('검색 결과에서 정확한 장소를 선택해주세요');
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
        age: parseInt(formData.age, 10),
        gender: formData.gender,
        location: {
          lat: latitude,
          lng: longitude,
          address: address.trim()
        },
        photo: formData.photo || undefined,
        photos: formData.photo ? [formData.photo] : [],
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

      // 로컬 스토어에도 추가 및 실시간 알림 큐에 등록
      addMissingPerson(data.report);
      enqueueNewPersonAlert([data.report]);

      // 성공 알림
      toast.success('실종자 제보가 성공적으로 등록되었습니다');

      // 폼 리셋
      setFormData(createInitialFormState());
      setAddress('');
      setLatitude(null);
      setLongitude(null);

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
    <>
      <div
        style={{
          position: isPage ? 'static' : 'fixed',
          top: isPage ? undefined : 0,
          left: isPage ? undefined : 0,
          right: isPage ? undefined : 0,
          bottom: isPage ? undefined : 0,
          backgroundColor: isPage ? 'transparent' : 'rgba(0, 0, 0, 0.7)',
          display: isPage ? 'block' : 'flex',
          alignItems: isPage ? undefined : 'center',
          justifyContent: isPage ? undefined : 'center',
          zIndex: isPage ? undefined : 2000,
          padding: isPage ? 0 : '20px'
        }}
        onClick={isPage ? undefined : onClose}
      >
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: isPage ? '16px' : '12px',
            padding: isPage ? '24px' : '30px',
            maxWidth: isPage ? 'none' : '600px',
            width: '100%',
            maxHeight: isPage ? undefined : '90vh',
            overflowY: isPage ? undefined : 'auto',
            boxShadow: isPage ? '0 1px 3px rgba(15,23,42,0.08)' : '0 10px 40px rgba(0,0,0,0.3)',
            border: isPage ? '1px solid #e2e8f0' : undefined
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
                실종 위치 검색 <span style={{ color: '#e74c3c' }}>*</span>
              </label>
              <button
                type="button"
                onClick={handleOpenLocationModal}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  textAlign: 'left',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
              >
                {address ? (
                  <span style={{ color: '#2c3e50' }}>{address}</span>
                ) : (
                  <span style={{ color: '#95a5a6' }}>주소를 검색하여 선택해주세요</span>
                )}
              </button>
              <p style={{ marginTop: '6px', fontSize: '12px', color: '#7f8c8d', lineHeight: 1.5 }}>
                버튼을 클릭해 주소를 검색하면 자동완성 목록이 표시됩니다. 선택한 위치의 좌표가 자동으로 저장됩니다.
              </p>
              {latitude !== null && longitude !== null && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: '#2c3e50',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                    padding: '8px',
                    border: '1px solid #e9ecef'
                  }}
                >
                  선택된 좌표: {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </div>
              )}
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

      {showLocationModal && (
        <LocationSearchModal
          isOpen={showLocationModal}
          onClose={handleCloseLocationModal}
          onSelect={handleLocationSelect}
          initialQuery={address}
        />
      )}
    </>
  );
}

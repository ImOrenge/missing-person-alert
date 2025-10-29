import React, { useEffect, useMemo, useState } from 'react';
import {
  AdvancedMarker,
  Pin,
  InfoWindow,
  useAdvancedMarkerRef
} from '@vis.gl/react-google-maps';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { MissingPerson } from '../types';
import ShareModal from './ShareModal';
import CommentsPanel from './MissingPersonComments/CommentsPanel';
import { useViewCount, formatViewCount } from '../hooks/useViewCount';

interface Props {
  person: MissingPerson;
  isSelected: boolean;
  isHighlighted?: boolean;
  onClick: () => void;
  onClose: () => void;
}

// 유형별 색상
function getColorByType(type: string): string {
  switch (type) {
    case 'missing_child':
      return '#e74c3c';
    case 'runaway':
      return '#3498db';
    case 'disabled':
      return '#f39c12';
    case 'dementia':
      return '#9b59b6';
    case 'facility':
      return '#27ae60';
    case 'unknown':
      return '#7f8c8d';
    default:
      return '#95a5a6';
  }
}

// 유형 레이블
function getTypeLabel(type: string): string {
  switch (type) {
    case 'missing_child':
      return '실종 아동';
    case 'runaway':
      return '가출인';
    case 'disabled':
      return '지적장애인';
    case 'dementia':
      return '치매환자';
    case 'facility':
      return '시설보호자';
    case 'unknown':
      return '신원불상';
    default:
      return '기타';
  }
}

const MarkerWithInfo = React.memo(({ person, isSelected, isHighlighted = false, onClick, onClose }: Props) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [activeTab, setActiveTab] = useState<'details' | 'comments'>('details');
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [hiddenPhotoIndexes, setHiddenPhotoIndexes] = useState<number[]>([]);

  // 조회수 추적 (InfoWindow가 열렸을 때만)
  const { viewCount } = useViewCount(isSelected ? person.id : null, true);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scale = isHighlighted || isSelected ? 1.5 : 1.2;
  const borderColor = isHighlighted ? '#FFD700' : '#000';

  const isMobile = windowWidth < 640;
  const isVerySmall = windowWidth < 400;

  const photoEntries = useMemo(() => {
    const basePhotos = Array.isArray(person.photos) && person.photos.length > 0
      ? person.photos
      : person.photo
      ? [person.photo]
      : [];

    return basePhotos
      .map((url, index) => ({ url, index }))
      .filter(({ index }) => !hiddenPhotoIndexes.includes(index));
  }, [person.photos, person.photo, hiddenPhotoIndexes]);

  useEffect(() => {
    setActivePhotoIndex(0);
    setHiddenPhotoIndexes([]);
  }, [person.id, person.photos?.length, person.photo]);

  useEffect(() => {
    if (activePhotoIndex >= photoEntries.length) {
      setActivePhotoIndex(photoEntries.length > 0 ? photoEntries.length - 1 : 0);
    }
  }, [activePhotoIndex, photoEntries.length]);

  const currentPhoto = photoEntries[activePhotoIndex];

  const handlePhotoError = (originalIndex: number) => {
    setHiddenPhotoIndexes(prev => (prev.includes(originalIndex) ? prev : [...prev, originalIndex]));
  };

  const showPhotoNavigation = photoEntries.length > 1;

  const handlePrevPhoto = () => {
    setActivePhotoIndex((prev) => {
      if (photoEntries.length === 0) return 0;
      return prev === 0 ? photoEntries.length - 1 : prev - 1;
    });
  };

  const handleNextPhoto = () => {
    setActivePhotoIndex((prev) => {
      if (photoEntries.length === 0) return 0;
      return prev === photoEntries.length - 1 ? 0 : prev + 1;
    });
  };

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={person.location}
        onClick={onClick}
        title={person.name}
        zIndex={isHighlighted || isSelected ? 1000 : 1}
        style={{
          transition: 'transform 0.3s ease-in-out',
          transform: isHighlighted || isSelected ? 'scale(1.1)' : 'scale(1)'
        }}
      >
        <div
          style={{
            transition: 'all 0.3s ease-in-out',
            filter: isHighlighted ? 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.8))' : 'none'
          }}
        >
          <Pin
            background={getColorByType(person.type)}
            glyphColor="#fff"
            borderColor={borderColor}
            scale={scale}
          />
        </div>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow
          anchor={marker}
          onCloseClick={() => {
            setActiveTab('details');
            onClose();
          }}
          maxWidth={isMobile ? windowWidth - 40 : 380}
        >
          <div
            className="info-window-content"
            style={{
              width: '100%',
              maxWidth: isMobile ? `${windowWidth - 60}px` : '360px',
              minWidth: isMobile ? 'auto' : '260px',
              padding: isMobile ? '8px' : '12px',
              fontSize: isMobile ? '12px' : '14px',
              boxSizing: 'border-box'
            }}
          >
            {currentPhoto ? (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  marginBottom: isMobile ? '8px' : '10px',
                  borderRadius: isMobile ? '6px' : '8px',
                  overflow: 'hidden'
                }}
              >
                <img
                  src={currentPhoto.url}
                  alt={`${person.name} 사진 ${activePhotoIndex + 1}`}
                  loading="lazy"
                  style={{
                    width: '100%',
                    maxHeight: isMobile ? '140px' : '220px',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                  onError={() => handlePhotoError(currentPhoto.index)}
                />

                {showPhotoNavigation && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrevPhoto}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '8px',
                        transform: 'translateY(-50%)',
                        backgroundColor: 'rgba(0, 0, 0, 0.45)',
                        color: 'white',
                        border: 'none',
                        width: isMobile ? '26px' : '32px',
                        height: isMobile ? '26px' : '32px',
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      aria-label="이전 사진"
                    >
                      <ChevronLeft size={isMobile ? 16 : 20} />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextPhoto}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        right: '8px',
                        transform: 'translateY(-50%)',
                        backgroundColor: 'rgba(0, 0, 0, 0.45)',
                        color: 'white',
                        border: 'none',
                        width: isMobile ? '26px' : '32px',
                        height: isMobile ? '26px' : '32px',
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      aria-label="다음 사진"
                    >
                      <ChevronRight size={isMobile ? 16 : 20} />
                    </button>
                  </>
                )}

                <div
                  style={{
                    position: 'absolute',
                    bottom: '6px',
                    right: '8px',
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: isMobile ? '10px' : '12px'
                  }}
                >
                  {activePhotoIndex + 1} / {photoEntries.length}
                </div>
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  maxHeight: isMobile ? '140px' : '220px',
                  borderRadius: isMobile ? '6px' : '8px',
                  marginBottom: isMobile ? '8px' : '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f4f6f8',
                  color: '#7f8c8d',
                  fontSize: isMobile ? '11px' : '13px'
                }}
              >
                등록된 사진이 없습니다
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: isMobile ? '15px' : '18px',
                  fontWeight: 'bold',
                  lineHeight: '1.3'
                }}
              >
                {person.name}
              </h3>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  backgroundColor: '#e3f2fd',
                  borderRadius: '12px',
                  fontSize: isMobile ? '10px' : '11px',
                  color: '#1976d2'
                }}
                title={`조회수: ${(viewCount || person.viewCount || 0).toLocaleString()}회`}
              >
                <Eye size={isMobile ? 12 : 14} />
                <span>{formatViewCount(viewCount || person.viewCount || 0)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                onClick={() => setActiveTab('details')}
                style={{
                  flex: 1,
                  padding: isMobile ? '8px' : '10px',
                  borderRadius: '8px',
                  border: activeTab === 'details' ? 'none' : '1px solid #dcdde1',
                  backgroundColor: activeTab === 'details' ? '#3498db' : 'white',
                  color: activeTab === 'details' ? 'white' : '#7f8c8d',
                  fontSize: isMobile ? '12px' : '14px',
                  fontWeight: activeTab === 'details' ? 'bold' : 'normal',
                  cursor: 'pointer'
                }}
              >
                상세 정보
              </button>
              <button
                onClick={() => setActiveTab('comments')}
                style={{
                  flex: 1,
                  padding: isMobile ? '8px' : '10px',
                  borderRadius: '8px',
                  border: activeTab === 'comments' ? 'none' : '1px solid #dcdde1',
                  backgroundColor: activeTab === 'comments' ? '#e74c3c' : 'white',
                  color: activeTab === 'comments' ? 'white' : '#7f8c8d',
                  fontSize: isMobile ? '12px' : '14px',
                  fontWeight: activeTab === 'comments' ? 'bold' : 'normal',
                  cursor: 'pointer'
                }}
              >
                근황 공유
              </button>
            </div>

            {activeTab === 'details' ? (
              <>
                <div
                  style={{
                    fontSize: isMobile ? '11px' : '14px',
                    lineHeight: isMobile ? '1.4' : '1.6'
                  }}
                >
                  <p style={{ margin: isMobile ? '3px 0' : '5px 0' }}>
                    <strong>나이:</strong> {person.age}세
                  </p>
                  <p style={{ margin: isMobile ? '3px 0' : '5px 0' }}>
                    <strong>성별:</strong> {person.gender === 'M' ? '남성' : person.gender === 'F' ? '여성' : '미상'}
                  </p>
                  {person.height && (
                    <p style={{ margin: isMobile ? '3px 0' : '5px 0' }}>
                      <strong>키:</strong> {person.height}cm
                    </p>
                  )}
                  {person.weight && (
                    <p style={{ margin: isMobile ? '3px 0' : '5px 0' }}>
                      <strong>몸무게:</strong> {person.weight}kg
                    </p>
                  )}
                  <p
                    style={{
                      margin: isMobile ? '3px 0' : '5px 0',
                      wordBreak: 'break-word'
                    }}
                  >
                    <strong>실종 장소:</strong> {person.location.address}
                  </p>
                  <p
                    style={{
                      margin: isMobile ? '3px 0' : '5px 0',
                      wordBreak: 'break-word'
                    }}
                  >
                    <strong>실종 일시:</strong>{' '}
                    {(() => {
                      const date = new Date(person.missingDate);
                      if (isNaN(date.getTime())) {
                        return person.missingDate;
                      }
                      return date.toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: isMobile ? 'short' : 'long',
                        day: 'numeric'
                      });
                    })()}
                  </p>
                  <p style={{ margin: isMobile ? '3px 0' : '5px 0' }}>
                    <strong>유형:</strong> {getTypeLabel(person.type)}
                  </p>
                  {person.clothes && (
                    <p
                      style={{
                        margin: isMobile ? '3px 0' : '5px 0',
                        wordBreak: 'break-word'
                      }}
                    >
                      <strong>옷차림:</strong> {person.clothes}
                    </p>
                  )}
                  {person.bodyType && (
                    <p style={{ margin: isMobile ? '3px 0' : '5px 0' }}>
                      <strong>체격:</strong> {person.bodyType}
                    </p>
                  )}
                  {person.hairColor && (
                    <p style={{ margin: isMobile ? '3px 0' : '5px 0' }}>
                      <strong>머리색:</strong> {person.hairColor}
                    </p>
                  )}
                  {person.description && (
                    <p
                      style={{
                        margin: isMobile ? '3px 0' : '5px 0',
                        wordBreak: 'break-word'
                      }}
                    >
                      <strong>특징:</strong> {person.description}
                    </p>
                  )}
                </div>

                <div
                  style={{
                    marginTop: isMobile ? '10px' : '15px',
                    display: 'flex',
                    gap: isMobile ? '6px' : '10px',
                    flexDirection: isVerySmall ? 'column' : 'row'
                  }}
                >
                  <button
                    onClick={() => window.open('tel:112')}
                    style={{
                      flex: 1,
                      padding: isMobile ? '8px' : '10px',
                      backgroundColor: '#e74c3c',
                      color: 'white',
                      border: 'none',
                      borderRadius: isMobile ? '4px' : '5px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: isMobile ? '12px' : '14px'
                    }}
                  >
                    112 신고
                  </button>
                  <button
                    onClick={() => setIsShareModalOpen(true)}
                    style={{
                      flex: 1,
                      padding: isMobile ? '8px' : '10px',
                      backgroundColor: '#3498db',
                      color: 'white',
                      border: 'none',
                      borderRadius: isMobile ? '4px' : '5px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: isMobile ? '12px' : '14px'
                    }}
                  >
                    정보 공유
                  </button>
                </div>
              </>
            ) : (
              <CommentsPanel missingPersonId={person.id} />
            )}
          </div>
        </InfoWindow>
      )}

      {isShareModalOpen && (
        <ShareModal
          person={person}
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}
    </>
  );
});

export default MarkerWithInfo;

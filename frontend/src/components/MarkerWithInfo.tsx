import React, { useEffect, useState } from 'react';
import {
  AdvancedMarker,
  Pin,
  InfoWindow,
  useAdvancedMarkerRef
} from '@vis.gl/react-google-maps';
import { MissingPerson } from '../types';
import ShareModal from './ShareModal';
import CommentsPanel from './MissingPersonComments/CommentsPanel';

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

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scale = isHighlighted || isSelected ? 1.5 : 1.2;
  const borderColor = isHighlighted ? '#FFD700' : '#000';

  const isMobile = windowWidth < 640;
  const isVerySmall = windowWidth < 400;

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
            {person.photo && (
              <img
                src={person.photo}
                alt={person.name}
                style={{
                  width: '100%',
                  maxHeight: isMobile ? '120px' : '200px',
                  objectFit: 'cover',
                  borderRadius: isMobile ? '6px' : '8px',
                  marginBottom: isMobile ? '8px' : '10px'
                }}
                onError={(event) => {
                  (event.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}

            <h3
              style={{
                margin: isMobile ? '6px 0' : '10px 0',
                fontSize: isMobile ? '15px' : '18px',
                fontWeight: 'bold',
                lineHeight: '1.3'
              }}
            >
              {person.name}
            </h3>

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

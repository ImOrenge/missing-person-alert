import React, { useState } from 'react';
import { MissingPerson } from '../types';
import {
  SNSType,
  getShareText,
  generateShareUrls,
  generateWebShareData,
  shareWithImage
} from '../utils/shareUtils';

interface ShareModalProps {
  person: MissingPerson;
  isOpen: boolean;
  onClose: () => void;
}

interface SNSOption {
  id: SNSType;
  name: string;
  color: string;
}

const snsOptions: SNSOption[] = [
  { id: 'kakao', name: '카카오톡', color: '#FEE500' },
  { id: 'facebook', name: 'Facebook', color: '#1877F2' },
  { id: 'x', name: 'X', color: '#000000' },
  { id: 'instagram', name: 'Instagram', color: '#E4405F' },
  { id: 'threads', name: 'Threads', color: '#000000' }
];

// SNS 로고 컴포넌트
const SNSIcon: React.FC<{ type: SNSType; className?: string }> = ({ type, className = 'w-6 h-6' }) => {
  const icons: Record<SNSType, JSX.Element> = {
    kakao: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.8 5.19 4.5 6.6l-1.2 4.32c-.12.36.24.66.6.48l5.1-3.36c.33.03.66.06 1 .06 5.52 0 10-3.48 10-7.8S17.52 3 12 3z"/>
      </svg>
    ),
    facebook: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    x: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
    instagram: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    ),
    threads: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.704-1.021 0-1.925-.336-2.69-.998-.672-.582-1.14-1.423-1.354-2.442-.243-1.158-.24-2.6.009-4.282.194-1.31.54-2.428 1.035-3.32.665-1.2 1.648-1.956 2.915-2.243.801-.181 1.618-.18 2.43.005.81.183 1.528.557 2.138 1.11.58.527.995 1.19 1.237 1.972.242.782.29 1.627.141 2.513-.164.979-.537 1.8-1.106 2.44-.569.641-1.29.97-2.144.979-1.068.01-1.683-.437-1.897-1.379-.134-.583-.085-1.22.164-1.863.244-.628.634-1.15 1.153-1.544l-.748-1.328c-.788.556-1.433 1.305-1.9 2.21-.464.897-.71 1.879-.734 2.914-.022.969.167 1.815.561 2.514.408.727 1.053 1.092 1.916 1.084.684-.006 1.267-.26 1.734-.756.465-.493.765-1.164.891-1.993.11-.73.057-1.395-.155-1.974-.207-.572-.549-1.026-1.014-1.347-.445-.307-.99-.46-1.618-.46-.624 0-1.188.162-1.675.483-.487.32-.864.782-1.12 1.372-.213.491-.32 1.062-.32 1.697 0 .704.146 1.32.434 1.83.287.508.713.867 1.266 1.067.553.2 1.197.213 1.913.038.72-.176 1.34-.553 1.844-1.123.504-.57.834-1.31.978-2.192.08-.488.09-.97.027-1.434l2.074.28c.088.616.071 1.247-.051 1.878-.288 1.488-.884 2.717-1.771 3.656-.886.94-2.002 1.52-3.318 1.727-.77.12-1.527.106-2.254-.043-.726-.15-1.406-.46-2.02-.924-.612-.462-1.089-1.063-1.421-1.78-.33-.716-.497-1.535-.497-2.432 0-1.063.167-2.06.494-2.96.326-.896.82-1.683 1.469-2.335.648-.65 1.443-1.147 2.362-1.477.918-.33 1.933-.5 3.015-.5 1.053 0 2.02.235 2.876.699.856.462 1.531 1.12 2.008 1.958.477.838.72 1.825.72 2.935 0 1.258-.335 2.438-1 3.52-.666 1.08-1.602 1.943-2.785 2.562-1.182.618-2.543.934-4.04.94z"/>
      </svg>
    ),
    email: <span className={`${className} text-lg`}>📧</span>,
    sms: <span className={`${className} text-lg`}>💬</span>
  };

  return icons[type] || null;
};

const ShareModal: React.FC<ShareModalProps> = ({ person, isOpen, onClose }) => {
  const [selectedSNS, setSelectedSNS] = useState<SNSType | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // SNS 선택 시 미리보기 텍스트 생성
  const handleSelectSNS = (sns: SNSType) => {
    setSelectedSNS(sns);
    const text = getShareText(sns, { person });
    setPreviewText(text);
    setCopied(false);
  };

  // 클립보드 복사 (텍스트 + 이미지)
  const handleCopy = async () => {
    try {
      if (person.photo) {
        // 이미지가 있으면 텍스트와 함께 공유
        await shareWithImage(previewText, person.photo, person.name);
        setCopied(true);
      } else {
        // 텍스트만 복사
        await navigator.clipboard.writeText(previewText);
        setCopied(true);
      }
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('복사 실패:', error);
      // 폴백: 텍스트만 복사
      try {
        await navigator.clipboard.writeText(previewText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        alert('복사에 실패했습니다.');
      }
    }
  };

  // 직접 공유 (URL 기반)
  const handleDirectShare = async (sns: SNSType) => {
    const urls = generateShareUrls({ person });

    switch (sns) {
      case 'facebook':
        window.open(urls.facebook, '_blank', 'width=600,height=400');
        break;
      case 'x':
        window.open(urls.twitter, '_blank', 'width=600,height=400');
        break;
      case 'kakao':
      case 'instagram':
      case 'threads':
        // 텍스트 생성 후 복사
        handleSelectSNS(sns);
        break;
    }
  };

  // Web Share API 사용 (모바일)
  const handleWebShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        const shareData = generateWebShareData({ person });
        await navigator.share(shareData);
        onClose();
      } catch (error) {
        console.error('공유 실패:', error);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">실종자 정보 공유</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 실종자 정보 */}
        <div className="p-4 bg-gray-50 border-b">
          <div className="flex items-center gap-3">
            {person.photo && (
              <img
                src={person.photo}
                alt={person.name}
                className="w-14 h-14 rounded-lg object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <div>
              <h3 className="font-semibold text-gray-900">{person.name}</h3>
              <p className="text-sm text-gray-600">
                {person.age}세 · {person.gender === 'M' ? '남성' : person.gender === 'F' ? '여성' : '미상'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{person.location.address}</p>
            </div>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-180px)]">
          {!selectedSNS ? (
            // SNS 선택 화면
            <div className="space-y-3">
              {/* Web Share API (모바일) */}
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button
                  onClick={handleWebShare}
                  className="w-full p-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all flex items-center justify-center gap-2 font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  빠른 공유
                </button>
              )}

              <div className="text-xs text-center text-gray-500 py-1">공유할 SNS를 선택하세요</div>

              {/* SNS 버튼 그리드 */}
              <div className="grid grid-cols-3 gap-2">
                {snsOptions.map((sns) => (
                  <button
                    key={sns.id}
                    onClick={() => handleDirectShare(sns.id)}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-all border border-gray-200"
                    style={{
                      backgroundColor: 'white',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: sns.color }}
                    >
                      <SNSIcon
                        type={sns.id}
                        className={`w-6 h-6 ${sns.id === 'kakao' ? 'text-black' : 'text-white'}`}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-700">{sns.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // 미리보기 화면
            <div className="space-y-3">
              <button
                onClick={() => setSelectedSNS(null)}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                뒤로
              </button>

              {/* 미리보기 텍스트 */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 max-h-64 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                  {previewText}
                </pre>
              </div>

              {person.photo && (
                <div className="text-xs text-gray-500 text-center">
                  💡 이미지가 함께 복사됩니다
                </div>
              )}

              {/* 복사 버튼 */}
              <button
                onClick={handleCopy}
                className={`w-full py-3 rounded-xl font-medium transition-all ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {copied ? '✓ 복사 완료!' : '복사하기'}
              </button>

              <p className="text-xs text-center text-gray-500">
                복사 후 {snsOptions.find(s => s.id === selectedSNS)?.name} 앱에 붙여넣기 하세요
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareModal;

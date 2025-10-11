import React from 'react';
import { X, Phone, Shield, AlertTriangle, CheckCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onVerify: () => void;
}

export default function VerificationPromptModal({ isOpen, onClose, onVerify }: Props) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2500,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '40px',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          textAlign: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 아이콘 */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          backgroundColor: '#fff3cd',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px'
        }}>
          <AlertTriangle size={40} color="#ffc107" />
        </div>

        {/* 제목 */}
        <h2 style={{
          margin: '0 0 16px 0',
          fontSize: '26px',
          color: '#2c3e50',
          fontWeight: 'bold'
        }}>
          전화번호 인증이 필요합니다
        </h2>

        {/* 설명 */}
        <p style={{
          margin: '0 0 24px 0',
          fontSize: '15px',
          color: '#7f8c8d',
          lineHeight: '1.6'
        }}>
          실종자 제보 기능을 사용하려면 전화번호 인증이 필수입니다.
          허위 신고를 방지하고 제보자를 확인하기 위해 필요합니다.
        </p>

        {/* 인증 혜택 */}
        <div style={{
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          textAlign: 'left'
        }}>
          <h3 style={{
            margin: '0 0 12px 0',
            fontSize: '14px',
            color: '#2c3e50',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Shield size={16} color="#3498db" />
            인증 후 이용 가능한 기능
          </h3>
          <ul style={{
            margin: 0,
            padding: '0 0 0 24px',
            fontSize: '13px',
            color: '#555',
            lineHeight: '1.8'
          }}>
            <li style={{ display: 'flex', alignItems: 'start', gap: '8px', marginBottom: '6px' }}>
              <CheckCircle size={14} color="#27ae60" style={{ marginTop: '3px', flexShrink: 0 }} />
              <span>실종자 제보 등록</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'start', gap: '8px', marginBottom: '6px' }}>
              <CheckCircle size={14} color="#27ae60" style={{ marginTop: '3px', flexShrink: 0 }} />
              <span>제보 내역 관리</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
              <CheckCircle size={14} color="#27ae60" style={{ marginTop: '3px', flexShrink: 0 }} />
              <span>신뢰도 높은 제보자 인증</span>
            </li>
          </ul>
        </div>

        {/* 안내 메시지 */}
        <p style={{
          margin: '0 0 24px 0',
          fontSize: '12px',
          color: '#95a5a6',
          lineHeight: '1.5',
          padding: '12px',
          backgroundColor: '#ecf0f1',
          borderRadius: '8px'
        }}>
          <Phone size={14} style={{ display: 'inline', marginRight: '4px' }} />
          인증 과정은 1-2분이 소요되며, 개인정보는 안전하게 보호됩니다.
        </p>

        {/* 버튼 */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '14px',
              backgroundColor: '#ecf0f1',
              color: '#7f8c8d',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dfe3e6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ecf0f1'}
          >
            나중에
          </button>
          <button
            onClick={() => {
              onClose();
              onVerify();
            }}
            style={{
              flex: 1,
              padding: '14px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2980b9'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3498db'}
          >
            <Phone size={18} />
            지금 인증하기
          </button>
        </div>
      </div>
    </div>
  );
}

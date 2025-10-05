import React from 'react';

interface Props {
  isConnected: boolean;
}

export default function ConnectionStatus({ isConnected }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        padding: '10px 20px',
        borderRadius: '25px',
        backgroundColor: isConnected ? '#27ae60' : '#e74c3c',
        color: 'white',
        fontWeight: 'bold',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}
    >
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: 'white',
          animation: isConnected ? 'pulse 2s infinite' : 'none'
        }}
      />
      {isConnected ? '실시간 연결 중' : '연결 끊김'}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

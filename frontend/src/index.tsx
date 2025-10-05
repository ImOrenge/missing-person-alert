import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(<App />);

// PWA Service Worker 등록
serviceWorkerRegistration.register({
  onSuccess: () => {
    console.log('✅ 오프라인 모드를 사용할 수 있습니다');
  },
  onUpdate: () => {
    console.log('🔄 새로운 버전이 있습니다. 새로고침하세요');
  }
});

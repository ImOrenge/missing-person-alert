/**
 * 전화번호 인증 사용 예시
 *
 * 이 파일은 PhoneAuthModal 컴포넌트를 사용하는 방법을 보여줍니다.
 */

import React, { useState, useEffect } from 'react';
import { PhoneAuthModal } from '../components/PhoneAuthModal';
import { auth, onAuthChange } from '../services/firebase';
import { Phone, CheckCircle, XCircle, LogOut } from 'lucide-react';
import { toast } from 'react-toastify';

export const PhoneAuthExample: React.FC = () => {
  const [showPhoneAuth, setShowPhoneAuth] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 인증 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthChange((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAuthSuccess = () => {
    toast.success('전화번호 인증이 완료되었습니다!');
    console.log('인증 완료:', auth.currentUser);
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast.success('로그아웃되었습니다');
    } catch (error) {
      toast.error('로그아웃 실패');
    }
  };

  const handleProtectedAction = async () => {
    if (!user) {
      toast.error('로그인이 필요합니다');
      setShowPhoneAuth(true);
      return;
    }

    if (!user.phoneNumber) {
      toast.error('전화번호 인증이 필요합니다');
      setShowPhoneAuth(true);
      return;
    }

    // 보호된 API 호출 예시
    try {
      const idToken = await user.getIdToken();

      const response = await fetch('http://localhost:3000/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          person: {
            name: '홍길동',
            age: 30,
            gender: 'male',
            location: {
              address: '서울특별시 강남구',
              latitude: 37.5172,
              longitude: 127.0473
            },
            missingDate: new Date().toISOString(),
            description: '테스트 제보입니다'
          }
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('제보가 등록되었습니다');
      } else {
        toast.error(data.error || '제보 등록 실패');
      }
    } catch (error) {
      console.error('API 호출 오류:', error);
      toast.error('API 호출 중 오류가 발생했습니다');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">전화번호 인증 예시</h1>

      {/* 사용자 정보 카드 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">현재 상태</h2>

        {user ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                {user.phoneNumber ? (
                  <CheckCircle className="text-green-500" size={20} />
                ) : (
                  <XCircle className="text-red-500" size={20} />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">전화번호 인증</p>
                <p className="text-sm text-gray-600">
                  {user.phoneNumber || '미인증'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                {user.email ? (
                  <CheckCircle className="text-green-500" size={20} />
                ) : (
                  <XCircle className="text-red-500" size={20} />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">이메일</p>
                <p className="text-sm text-gray-600">
                  {user.email || '미등록'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <CheckCircle className="text-blue-500" size={20} />
              </div>
              <div className="flex-1">
                <p className="font-medium">사용자 ID</p>
                <p className="text-sm text-gray-600 font-mono">{user.uid}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <LogOut size={18} />
              로그아웃
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">로그인되지 않았습니다</p>
            <button
              onClick={() => setShowPhoneAuth(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              전화번호로 로그인
            </button>
          </div>
        )}
      </div>

      {/* 기능 테스트 버튼들 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">기능 테스트</h2>

        <div className="space-y-4">
          <div>
            <button
              onClick={() => setShowPhoneAuth(true)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Phone size={20} />
              전화번호 인증 모달 열기
            </button>
            <p className="mt-2 text-sm text-gray-600">
              전화번호 인증 UI를 테스트할 수 있습니다
            </p>
          </div>

          <div>
            <button
              onClick={handleProtectedAction}
              disabled={!user || !user.phoneNumber}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              보호된 API 호출 (제보 등록)
            </button>
            <p className="mt-2 text-sm text-gray-600">
              전화번호 인증이 필요한 API를 테스트합니다
            </p>
          </div>
        </div>
      </div>

      {/* 코드 예시 */}
      <div className="bg-gray-900 rounded-lg p-6 text-white">
        <h2 className="text-xl font-semibold mb-4">코드 예시</h2>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-400 mb-2">1. 컴포넌트 import</p>
            <pre className="bg-gray-800 p-3 rounded text-sm overflow-x-auto">
{`import { PhoneAuthModal } from './components/PhoneAuthModal';`}
            </pre>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">2. 모달 사용</p>
            <pre className="bg-gray-800 p-3 rounded text-sm overflow-x-auto">
{`<PhoneAuthModal
  isOpen={showPhoneAuth}
  onClose={() => setShowPhoneAuth(false)}
  onSuccess={() => {
    console.log('인증 완료');
  }}
/>`}
            </pre>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-2">3. 인증된 API 호출</p>
            <pre className="bg-gray-800 p-3 rounded text-sm overflow-x-auto">
{`const user = auth.currentUser;
const idToken = await user.getIdToken();

const response = await fetch('/api/reports', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${idToken}\`
  },
  body: JSON.stringify(data)
});`}
            </pre>
          </div>
        </div>
      </div>

      {/* 전화번호 인증 모달 */}
      <PhoneAuthModal
        isOpen={showPhoneAuth}
        onClose={() => setShowPhoneAuth(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
};

export default PhoneAuthExample;

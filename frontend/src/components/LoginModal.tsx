import React, { useState, useEffect } from 'react';
import { X, LogIn, Mail, Lock } from 'lucide-react';
import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  initRecaptcha,
  resolveMFAWithPhone,
  completeMFASignIn,
  clearRecaptcha
} from '../services/firebase';
import { PhoneAuthModal } from './PhoneAuthModal';
import { toast } from 'react-toastify';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: Props) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPhoneAuth, setShowPhoneAuth] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<{
    email: string;
    password: string;
    name: string;
    nickname: string;
    address: string;
    phoneNumber: string;
  } | null>(null);

  // MFA 상태
  const [showMFA, setShowMFA] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<any>(null);
  const [mfaVerificationId, setMfaVerificationId] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  // 모달 닫힐 때 정리
  useEffect(() => {
    if (!isOpen) {
      clearRecaptcha();
      setShowMFA(false);
      setMfaResolver(null);
      setMfaVerificationId('');
      setMfaCode('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        // 회원가입 시 유효성 검증
        if (password !== passwordConfirm) {
          toast.error('비밀번호가 일치하지 않습니다');
          setLoading(false);
          return;
        }

        if (!name.trim()) {
          toast.error('이름을 입력해주세요');
          setLoading(false);
          return;
        }

        if (!nickname.trim()) {
          toast.error('닉네임을 입력해주세요');
          setLoading(false);
          return;
        }

        // 전화번호 인증 먼저 진행
        setPendingRegistration({ email, password, name, nickname, address, phoneNumber });
        setShowPhoneAuth(true);
        setLoading(false);
      } else {
        // 로그인은 바로 진행
        const result = await loginWithEmail(email, password);

        if (result.success) {
          toast.success('로그인되었습니다!');
          onClose();
          setEmail('');
          setPassword('');
        } else if (result.requiresMFA) {
          // MFA 필요 - reCAPTCHA 초기화 후 SMS 전송
          toast.info('다단계 인증이 필요합니다');

          // 먼저 MFA 모달 표시
          setShowMFA(true);

          // DOM 렌더링 후 reCAPTCHA 초기화 및 SMS 전송
          setTimeout(async () => {
            try {
              initRecaptcha('mfa-recaptcha-container');

              // reCAPTCHA 렌더링 대기
              await new Promise(resolve => setTimeout(resolve, 500));

              const mfaResult = await resolveMFAWithPhone(result.error);

              if (mfaResult.success && mfaResult.verificationId) {
                setMfaResolver(mfaResult.resolver);
                setMfaVerificationId(mfaResult.verificationId);
                toast.success(mfaResult.message);
              } else {
                toast.error(mfaResult.message || 'MFA 인증 실패');
                setShowMFA(false);
              }
            } catch (error: any) {
              console.error('MFA 초기화 오류:', error);
              toast.error('MFA 초기화에 실패했습니다');
              setShowMFA(false);
            } finally {
              setLoading(false);
            }
          }, 300);

          return; // setLoading(false) 실행 방지
        } else {
          toast.error(result.message || result.error || '로그인에 실패했습니다');
        }
        setLoading(false);
      }
    } catch (error: any) {
      console.error('로그인/회원가입 오류:', error);
      toast.error(error.message || '오류가 발생했습니다');
      setLoading(false);
    }
  };

  const handlePhoneAuthSuccess = async () => {
    // 전화번호 인증 완료 후 회원가입 진행
    if (!pendingRegistration) {
      toast.error('회원가입 정보가 없습니다');
      return;
    }

    setLoading(true);
    try {
      const result = await registerWithEmail(
        pendingRegistration.email,
        pendingRegistration.password
      );

      if (result.success && result.user) {
        // Firestore에 사용자 정보 저장
        const { firestore, doc, setDoc, Timestamp } = await import('../services/firebase');
        const userRef = doc(firestore, 'users', result.user.uid);

        await setDoc(userRef, {
          name: pendingRegistration.name,
          nickname: pendingRegistration.nickname,
          address: pendingRegistration.address || '',
          phoneNumber: pendingRegistration.phoneNumber || '',
          email: pendingRegistration.email,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });

        toast.success('회원가입이 완료되었습니다!');
        setShowPhoneAuth(false);
        setPendingRegistration(null);
        setEmail('');
        setPassword('');
        setPasswordConfirm('');
        setName('');
        setNickname('');
        setAddress('');
        setPhoneNumber('');
        onClose();
      } else {
        toast.error(result.error || '회원가입에 실패했습니다');
      }
    } catch (error: any) {
      console.error('회원가입 오류:', error);
      toast.error(error.message || '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);

    try {
      const result = await loginWithGoogle();

      if (result.success) {
        toast.success('Google 로그인 성공!');
        onClose();
      } else if (result.requiresMFA) {
        // MFA 필요 - reCAPTCHA 초기화 후 SMS 전송
        toast.info('다단계 인증이 필요합니다');

        // 먼저 MFA 모달 표시
        setShowMFA(true);

        // DOM 렌더링 후 reCAPTCHA 초기화 및 SMS 전송
        setTimeout(async () => {
          try {
            initRecaptcha('mfa-recaptcha-container');

            // reCAPTCHA 렌더링 대기
            await new Promise(resolve => setTimeout(resolve, 500));

            const mfaResult = await resolveMFAWithPhone(result.error);

            if (mfaResult.success && mfaResult.verificationId) {
              setMfaResolver(mfaResult.resolver);
              setMfaVerificationId(mfaResult.verificationId);
              toast.success(mfaResult.message);
            } else {
              toast.error(mfaResult.message || 'MFA 인증 실패');
              setShowMFA(false);
            }
          } catch (error: any) {
            console.error('MFA 초기화 오류:', error);
            toast.error('MFA 초기화에 실패했습니다');
            setShowMFA(false);
          } finally {
            setLoading(false);
          }
        }, 300);

        return; // setLoading(false) 실행 방지
      } else {
        toast.error(result.message || result.error || 'Google 로그인에 실패했습니다');
      }
    } catch (error: any) {
      console.error('Google 로그인 오류:', error);
      toast.error(error.message || '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleMFAVerify = async () => {
    if (!mfaCode.trim() || mfaCode.length !== 6) {
      toast.error('6자리 인증 코드를 입력해주세요');
      return;
    }

    setLoading(true);
    try {
      const result = await completeMFASignIn(mfaResolver, mfaVerificationId, mfaCode);

      if (result.success) {
        toast.success(result.message);
        setShowMFA(false);
        setMfaCode('');
        onClose();
      } else {
        toast.error(result.message || 'MFA 인증 실패');
      }
    } catch (error: any) {
      console.error('MFA 인증 오류:', error);
      toast.error(error.message || '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* MFA 인증 모달 */}
      {showMFA && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Lock className="text-blue-600" />
                다단계 인증
              </h2>
              <button
                onClick={() => {
                  setShowMFA(false);
                  setMfaCode('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <p className="text-gray-600 text-sm mb-4">
              등록된 전화번호로 인증 코드가 전송되었습니다.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  인증 코드
                </label>
                <input
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="6자리 인증 코드"
                  maxLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                  disabled={loading}
                  autoFocus
                />
              </div>

              <button
                onClick={handleMFAVerify}
                disabled={loading || mfaCode.length !== 6}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '확인 중...' : '인증하기'}
              </button>
            </div>

            {/* MFA reCAPTCHA 컨테이너 */}
            <div id="mfa-recaptcha-container" className="mt-4"></div>
          </div>
        </div>
      )}

      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
          onClick={(e) => e.stopPropagation()}
        >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LogIn className="text-red-600" />
            {isSignUp ? '회원가입' : '로그인'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Google 로그인 버튼 */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full mb-4 bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google로 {isSignUp ? '회원가입' : '로그인'}
        </button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">또는</span>
          </div>
        </div>

        {/* 이메일 로그인 폼 */}
        <form onSubmit={handleEmailLogin} className="space-y-4 max-h-[60vh] overflow-y-auto px-1">
          {isSignUp && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors disabled:opacity-50"
                  placeholder="홍길동"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  닉네임 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors disabled:opacity-50"
                  placeholder="별명을 입력하세요"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  주소
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors disabled:opacity-50"
                  placeholder="서울특별시 강남구..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  전화번호
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors disabled:opacity-50"
                  placeholder="010-1234-5678"
                />
                <p className="mt-1 text-xs text-gray-500">회원가입 후 전화번호 인증이 진행됩니다</p>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이메일 <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors disabled:opacity-50"
              placeholder="example@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors disabled:opacity-50"
              placeholder="6자 이상 입력하세요"
            />
          </div>

          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호 확인 <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                disabled={loading}
                minLength={6}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-colors disabled:opacity-50 ${
                  passwordConfirm && password !== passwordConfirm
                    ? 'border-red-500'
                    : 'border-gray-300 focus:border-red-500'
                }`}
                placeholder="비밀번호를 다시 입력하세요"
              />
              {passwordConfirm && password !== passwordConfirm && (
                <p className="mt-1 text-xs text-red-500">비밀번호가 일치하지 않습니다</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Mail size={20} />
            {loading ? '처리 중...' : isSignUp ? '다음 (전화번호 인증)' : '로그인'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-500 text-center">
          로그인하시면 실종자 제보 기록을 관리할 수 있습니다
        </p>

        {isSignUp && (
          <p className="mt-2 text-xs text-yellow-600 text-center font-medium">
            ⚠️ 회원가입 시 전화번호 인증이 필요합니다
          </p>
        )}
      </div>
    </div>

    {/* 전화번호 인증 모달 */}
    <PhoneAuthModal
      isOpen={showPhoneAuth}
      onClose={() => {
        setShowPhoneAuth(false);
        setPendingRegistration(null);
      }}
      onSuccess={handlePhoneAuthSuccess}
      mode="signup"
    />
    </>
  );
}

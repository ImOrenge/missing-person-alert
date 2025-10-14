import React, { useState, useEffect } from 'react';
import { X, Phone, Lock } from 'lucide-react';
import {
  initRecaptcha,
  sendPhoneVerificationCode,
  linkPhoneNumber,
  verifyPhoneCode,
  clearRecaptcha,
  type ConfirmationResult
} from '../services/firebase';
import {
  validatePhoneNumber,
  canAttemptAuth,
  recordAuthAttempt,
  clearAuthAttempts,
  getSecurityWarning
} from '../utils/phoneAuthSecurity';
import { toast } from 'react-toastify';

interface PhoneAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode?: 'signup' | 'link'; // signup: 회원가입 시 전화번호 인증만, link: 기존 계정에 연결
}

export const PhoneAuthModal: React.FC<PhoneAuthModalProps> = ({ isOpen, onClose, onSuccess, mode = 'link' }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (isOpen) {
      // reCAPTCHA 초기화 - 더 긴 지연시간으로 DOM 준비 보장
      const timer = setTimeout(() => {
        try {
          console.log('🔄 reCAPTCHA 초기화 시도...');
          const verifier = initRecaptcha('recaptcha-container');

          // reCAPTCHA 렌더링
          verifier.render().then((widgetId: any) => {
            console.log('✅ reCAPTCHA 렌더링 완료, widgetId:', widgetId);
          }).catch((error: any) => {
            console.error('❌ reCAPTCHA 렌더링 실패:', error);
            toast.error('reCAPTCHA 초기화에 실패했습니다. 페이지를 새로고침해주세요.');
          });
        } catch (error) {
          console.error('❌ reCAPTCHA 초기화 실패:', error);
          toast.error('reCAPTCHA 초기화에 실패했습니다. 페이지를 새로고침해주세요.');
        }
      }, 300);

      return () => {
        clearTimeout(timer);
      };
    } else {
      // 모달이 닫힐 때 정리
      clearRecaptcha();
    }
  }, [isOpen]);

  // 카운트다운 타이머
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      toast.error('전화번호를 입력해주세요');
      return;
    }

    // 전화번호 형식 검증
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.valid) {
      toast.error(validation.message || '올바른 전화번호 형식이 아닙니다');
      return;
    }

    // Rate Limiting 확인
    const attemptCheck = canAttemptAuth(phoneNumber);
    if (!attemptCheck.allowed) {
      toast.error(attemptCheck.message || '너무 많은 시도로 차단되었습니다');
      return;
    }

    // 보안 경고 표시
    const warning = getSecurityWarning(phoneNumber);
    if (warning) {
      toast.warning(warning, { autoClose: 5000 });
    }

    setLoading(true);
    try {
      // 시도 기록
      recordAuthAttempt(phoneNumber);

      const result = await sendPhoneVerificationCode(phoneNumber);

      if (result.success && result.confirmationResult) {
        setConfirmationResult(result.confirmationResult);
        setStep('code');
        setCountdown(180); // 3분 카운트다운
        toast.success(result.message);
      } else {
        toast.error(result.message || 'SMS 전송에 실패했습니다');
        // reCAPTCHA 재초기화
        setTimeout(() => {
          try {
            initRecaptcha('recaptcha-container');
          } catch (error) {
            console.error('reCAPTCHA 재초기화 실패:', error);
          }
        }, 100);
      }
    } catch (error: any) {
      console.error('SMS 전송 오류:', error);
      toast.error('SMS 전송 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      toast.error('인증 코드를 입력해주세요');
      return;
    }

    if (!confirmationResult) {
      toast.error('먼저 인증 코드를 요청해주세요');
      return;
    }

    setLoading(true);
    try {
      let result;

      if (mode === 'signup') {
        // 회원가입 모드: 전화번호 인증만 확인 (계정 연결 안 함)
        result = await verifyPhoneCode(confirmationResult, verificationCode);
      } else {
        // 계정 연결 모드: 기존 계정에 전화번호 연결
        result = await linkPhoneNumber(confirmationResult, verificationCode);
      }

      if (result.success) {
        // 인증 성공 시 시도 기록 초기화
        clearAuthAttempts(phoneNumber);

        toast.success(result.message);
        handleClose();
        onSuccess();

        // 계정 연결 모드일 때만 페이지 새로고침
        if (mode === 'link') {
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } else {
        // 실패 시 시도 기록
        recordAuthAttempt(phoneNumber);
        toast.error(result.message || '인증 코드가 올바르지 않습니다');

        // 보안 경고 재확인
        const warning = getSecurityWarning(phoneNumber);
        if (warning) {
          toast.warning(warning, { autoClose: 5000 });
        }
      }
    } catch (error: any) {
      console.error('인증 코드 확인 오류:', error);
      toast.error('인증 코드 확인 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPhoneNumber('');
    setVerificationCode('');
    setConfirmationResult(null);
    setStep('phone');
    setCountdown(0);
    clearRecaptcha();
    onClose();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative">
        {/* 닫기 버튼 */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X size={24} />
        </button>

        {/* 헤더 */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {step === 'phone' ? '전화번호 인증' : 'SMS 인증 코드 입력'}
          </h2>
          <p className="text-gray-600 text-sm">
            {step === 'phone'
              ? '보안을 위해 전화번호 인증이 필요합니다'
              : `${phoneNumber}로 전송된 인증 코드를 입력해주세요`}
          </p>
        </div>

        {/* 전화번호 입력 단계 */}
        {step === 'phone' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                전화번호
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="010-1234-5678"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                * 한국 전화번호만 지원합니다 (예: 010-1234-5678)
              </p>
            </div>

            <button
              onClick={handleSendCode}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '전송 중...' : '인증 코드 받기'}
            </button>
          </div>
        )}

        {/* 인증 코드 입력 단계 */}
        {step === 'code' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  인증 코드
                </label>
                {countdown > 0 && (
                  <span className="text-sm text-red-500 font-medium">
                    {formatTime(countdown)}
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="6자리 인증 코드"
                  maxLength={6}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('phone');
                  setVerificationCode('');
                  setCountdown(0);
                }}
                disabled={loading}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                다시 입력
              </button>
              <button
                onClick={handleVerifyCode}
                disabled={loading || verificationCode.length !== 6}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '확인 중...' : '인증하기'}
              </button>
            </div>

            <button
              onClick={handleSendCode}
              disabled={loading || countdown > 120}
              className="w-full text-blue-600 text-sm hover:underline disabled:text-gray-400 disabled:no-underline"
            >
              인증 코드 재전송
            </button>
          </div>
        )}

        {/* reCAPTCHA 컨테이너 */}
        <div id="recaptcha-container" className="mt-4"></div>

        {/* 보안 안내 */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>보안 안내:</strong> 인증 코드는 타인에게 절대 공유하지 마세요.
            실종자 알림 시스템은 어떠한 경우에도 전화나 문자로 인증 코드를 요구하지 않습니다.
          </p>
        </div>
      </div>
    </div>
  );
};

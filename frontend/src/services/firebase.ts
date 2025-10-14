import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, Timestamp, onSnapshot } from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  ConfirmationResult,
  getMultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCt5K-CIK7AUc6N1bbP4sK5NmJ29g8TG9M",
  authDomain: "missing-person-alram.firebaseapp.com",
  projectId: "missing-person-alram",
  storageBucket: "missing-person-alram.firebasestorage.app",
  messagingSenderId: "558387804013",
  appId: "1:558387804013:web:1d85bc6e03e17e80a5cc64",
  measurementId: "G-DNE8F851CX"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const auth = getAuth(app);

// Google 로그인 제공자
const googleProvider = new GoogleAuthProvider();

/**
 * 이메일/비밀번호로 회원가입
 */
export const registerWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return {
      success: true,
      user: userCredential.user
    };
  } catch (error: any) {
    console.error('회원가입 실패:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 이메일/비밀번호로 로그인
 */
export const loginWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return {
      success: true,
      user: userCredential.user
    };
  } catch (error: any) {
    console.error('로그인 실패:', error);

    // MFA 필요한 경우
    if (error.code === 'auth/multi-factor-auth-required') {
      return {
        success: false,
        requiresMFA: true,
        error: error,
        message: '이 계정은 다단계 인증이 필요합니다'
      };
    }

    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Google 계정으로 로그인
 */
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return {
      success: true,
      user: result.user
    };
  } catch (error: any) {
    console.error('Google 로그인 실패:', error);

    // MFA 필요한 경우
    if (error.code === 'auth/multi-factor-auth-required') {
      return {
        success: false,
        requiresMFA: true,
        error: error,
        message: '이 계정은 다단계 인증이 필요합니다'
      };
    }

    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 로그아웃
 */
export const logout = async () => {
  try {
    await signOut(auth);
    return {
      success: true
    };
  } catch (error: any) {
    console.error('로그아웃 실패:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 인증 상태 변경 리스너
 */
export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// reCAPTCHA 설정
let recaptchaVerifier: RecaptchaVerifier | null = null;

/**
 * reCAPTCHA 초기화
 */
export const initRecaptcha = (containerId: string) => {
  try {
    if (recaptchaVerifier) {
      try {
        recaptchaVerifier.clear();
      } catch (e) {
        console.warn('reCAPTCHA clear 실패 (무시):', e);
      }
      recaptchaVerifier = null;
    }

    // DOM 요소 확인
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`reCAPTCHA 컨테이너를 찾을 수 없습니다: ${containerId}`);
      throw new Error(`reCAPTCHA 컨테이너를 찾을 수 없습니다: ${containerId}`);
    }

    // 기존 reCAPTCHA 위젯 제거
    container.innerHTML = '';

    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible', // invisible 모드로 변경
      callback: () => {
        console.log('✅ Firebase reCAPTCHA 인증 완료');
      },
      'expired-callback': () => {
        console.warn('⚠️ Firebase reCAPTCHA 만료됨');
      },
      'error-callback': (error: any) => {
        console.error('❌ Firebase reCAPTCHA 오류:', error);
      }
    });

    console.log('🔄 Firebase reCAPTCHA 초기화 완료');
    return recaptchaVerifier;
  } catch (error) {
    console.error('reCAPTCHA 초기화 실패:', error);
    throw error;
  }
};

/**
 * 전화번호로 SMS 인증 코드 전송
 */
export const sendPhoneVerificationCode = async (phoneNumber: string) => {
  try {
    if (!recaptchaVerifier) {
      throw new Error('reCAPTCHA가 초기화되지 않았습니다');
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('로그인된 사용자가 없습니다');
    }

    // 국제 전화번호 형식 확인 (예: +82 10-1234-5678)
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+82${phoneNumber.replace(/^0/, '')}`;

    const confirmationResult = await linkWithPhoneNumber(currentUser, formattedPhone, recaptchaVerifier);

    return {
      success: true,
      confirmationResult,
      message: 'SMS 인증 코드가 전송되었습니다'
    };
  } catch (error: any) {
    console.error('SMS 전송 실패:', error);

    // reCAPTCHA 재설정
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }

    return {
      success: false,
      error: error.message,
      message: 'SMS 전송에 실패했습니다'
    };
  }
};

/**
 * SMS 인증 코드 확인 및 로그인
 */
export const verifyPhoneCode = async (confirmationResult: ConfirmationResult, code: string) => {
  try {
    const result = await confirmationResult.confirm(code);
    return {
      success: true,
      user: result.user,
      message: '전화번호 인증이 완료되었습니다'
    };
  } catch (error: any) {
    console.error('인증 코드 확인 실패:', error);
    return {
      success: false,
      error: error.message,
      message: '인증 코드가 올바르지 않습니다'
    };
  }
};

/**
 * 전화번호 인증 후 Firestore에 저장 (기존 계정에 추가)
 */
export const linkPhoneNumber = async (confirmationResult: ConfirmationResult, code: string) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('로그인된 사용자가 없습니다');
    }

    // 현재 로그인된 사용자 정보 백업
    const currentUserEmail = currentUser.email;
    const currentUserId = currentUser.uid;

    console.log('📱 전화번호 인증 시작:', { currentUserId, currentUserEmail });

    const result = await confirmationResult.confirm(code);

    await currentUser.reload();
    const linkedUser = auth.currentUser;
    const phoneNumber = linkedUser?.phoneNumber || result.user.phoneNumber;

    if (!phoneNumber) {
      throw new Error('전화번호를 확인할 수 없습니다');
    }

    console.log('✅ 전화번호 인증 성공:', phoneNumber);

    // 원래 사용자의 Firestore에 전화번호 저장
    const userRef = doc(firestore, 'users', currentUserId);
    await setDoc(userRef, {
      phoneNumber: phoneNumber,
      phoneVerified: true,
      phoneVerifiedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }, { merge: true });

    console.log('✅ Firestore 저장 완료:', currentUserId);

    return {
      success: true,
      message: '전화번호가 인증되었습니다'
    };
  } catch (error: any) {
    console.error('❌ 전화번호 연결 실패:', error);

    // 에러 메시지 개선
    let message = '전화번호 인증에 실패했습니다';
    if (error.code === 'auth/code-expired') {
      message = '인증 코드가 만료되었습니다. 다시 시도해주세요';
    } else if (error.code === 'auth/invalid-verification-code') {
      message = '인증 코드가 올바르지 않습니다';
    } else if (error.code === 'auth/session-expired') {
      message = '세션이 만료되었습니다. 다시 시도해주세요';
    }

    return {
      success: false,
      error: error.message,
      message
    };
  }
};

/**
 * reCAPTCHA 정리
 */
export const clearRecaptcha = () => {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }
};

/**
 * MFA 해결 - SMS 인증 코드 전송
 */
export const resolveMFAWithPhone = async (error: any) => {
  try {
    if (!recaptchaVerifier) {
      throw new Error('reCAPTCHA가 초기화되지 않았습니다');
    }

    const resolver = getMultiFactorResolver(auth, error);

    // 전화번호 인증 팩터 찾기
    const phoneInfoOptions = {
      multiFactorHint: resolver.hints[0],
      session: resolver.session
    };

    const phoneAuthProvider = new PhoneAuthProvider(auth);
    const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);

    return {
      success: true,
      resolver,
      verificationId,
      message: 'MFA 인증 코드가 전송되었습니다'
    };
  } catch (error: any) {
    console.error('MFA 해결 실패:', error);
    return {
      success: false,
      error: error.message,
      message: 'MFA 인증 코드 전송에 실패했습니다'
    };
  }
};

/**
 * MFA 인증 코드 확인
 */
export const completeMFASignIn = async (resolver: any, verificationId: string, verificationCode: string) => {
  try {
    const cred = PhoneAuthProvider.credential(verificationId, verificationCode);
    const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);

    const userCredential = await resolver.resolveSignIn(multiFactorAssertion);

    return {
      success: true,
      user: userCredential.user,
      message: 'MFA 인증이 완료되었습니다'
    };
  } catch (error: any) {
    console.error('MFA 인증 확인 실패:', error);
    return {
      success: false,
      error: error.message,
      message: 'MFA 인증 코드가 올바르지 않습니다'
    };
  }
};

export {
  firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  auth
};
export type { RecaptchaVerifier, ConfirmationResult };

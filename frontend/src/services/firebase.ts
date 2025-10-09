import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, query, orderByChild, limitToLast, update, get } from 'firebase/database';
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
  signInWithPhoneNumber,
  ConfirmationResult,
  PhoneAuthProvider,
  linkWithCredential
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCt5K-CIK7AUc6N1bbP4sK5NmJ29g8TG9M",
  authDomain: "missing-person-alram.firebaseapp.com",
  projectId: "missing-person-alram",
  storageBucket: "missing-person-alram.firebasestorage.app",
  messagingSenderId: "558387804013",
  appId: "1:558387804013:web:1d85bc6e03e17e80a5cc64",
  measurementId: "G-DNE8F851CX",
  databaseURL: "https://missing-person-alram-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
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
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      console.log('reCAPTCHA 인증 완료');
    },
    'expired-callback': () => {
      console.log('reCAPTCHA 만료됨');
    }
  });

  return recaptchaVerifier;
};

/**
 * 전화번호로 SMS 인증 코드 전송
 */
export const sendPhoneVerificationCode = async (phoneNumber: string) => {
  try {
    if (!recaptchaVerifier) {
      throw new Error('reCAPTCHA가 초기화되지 않았습니다');
    }

    // 국제 전화번호 형식 확인 (예: +82 10-1234-5678)
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+82${phoneNumber.replace(/^0/, '')}`;

    const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);

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
 * 기존 사용자 계정에 전화번호 연결
 */
export const linkPhoneNumber = async (phoneNumber: string, verificationCode: string) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('로그인된 사용자가 없습니다');
    }

    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+82${phoneNumber.replace(/^0/, '')}`;
    const credential = PhoneAuthProvider.credential(verificationCode, formattedPhone);

    await linkWithCredential(currentUser, credential);

    return {
      success: true,
      message: '전화번호가 계정에 연결되었습니다'
    };
  } catch (error: any) {
    console.error('전화번호 연결 실패:', error);
    return {
      success: false,
      error: error.message,
      message: '전화번호 연결에 실패했습니다'
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

export { database, ref, onValue, query, orderByChild, limitToLast, update, get, auth };
export type { RecaptchaVerifier, ConfirmationResult };

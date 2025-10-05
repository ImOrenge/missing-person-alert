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
  User
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

export { database, ref, onValue, query, orderByChild, limitToLast, update, get, auth };

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, query, orderByChild, limitToLast, update, get } from 'firebase/database';

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

export { database, ref, onValue, query, orderByChild, limitToLast, update, get };

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCt5K-CIK7AUc6N1bbP4sK5NmJ29g8TG9M",
  authDomain: "missing-person-alram.firebaseapp.com",
  databaseURL: "https://missing-person-alram-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "missing-person-alram",
  storageBucket: "missing-person-alram.firebasestorage.app",
  messagingSenderId: "558387804013",
  appId: "1:558387804013:web:1d85bc6e03e17e80a5cc64",
  measurementId: "G-DNE8F851CX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
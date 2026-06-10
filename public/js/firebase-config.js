// ═══════════════════════════════════════════════════════
//  firebase-config.js  —  Superchat Firebase SDK v10
// ═══════════════════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection, addDoc,
  query, orderBy, limit,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAIEjRDhSAG8FXJfVO6Hrq3PNaX0tp93nM",
  authDomain: "superchat-47a2d.firebaseapp.com",
  projectId: "superchat-47a2d",
  storageBucket: "superchat-47a2d.firebasestorage.app",
  messagingSenderId: "593878670337",
  appId: "1:593878670337:web:1116f99500c6f8fe8cb400"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
  db, auth,
  collection, addDoc,
  query, orderBy, limit,
  onSnapshot, serverTimestamp,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
};

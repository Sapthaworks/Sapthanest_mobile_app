import { initializeApp, getApps, getApp } from 'firebase/app';
// @ts-ignore - Metro resolves React Native persistence, but TS web definitions omit the export
import { initializeAuth, getReactNativePersistence, getAuth, Auth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCKzEltsiwm0WELhbU64BeQiop-c_ESCyA",
  authDomain: "sapthanest.firebaseapp.com",
  databaseURL: "https://sapthanest-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sapthanest",
  storageBucket: "sapthanest.firebasestorage.app",
  messagingSenderId: "175351604424",
  appId: "1:175351604424:web:7189cb635519c475ccb1fd",
  measurementId: "G-JM19N00E9B"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with AsyncStorage persistence so sessions survive app restarts
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Fallback if already initialized during Fast Refresh / hot reloads
  auth = getAuth(app);
}

const db = getDatabase(app);

export { app, auth, db };
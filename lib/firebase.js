import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 先ほど .env.local に隠した鍵をここで呼び出します
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// アプリが裏側で何回も再起動した時に、Firebaseがエラーを起こさないようにするおまじない
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// データベース（本棚）を使うための準備
const db = getFirestore(app, "friends");

// 他のファイルからも本棚（db）を使えるようにエクスポートします
export { db };
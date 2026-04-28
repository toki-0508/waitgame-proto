import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// NOTE:
// - ここにある firebaseConfig（apiKey 等）は「Webアプリ用の公開設定」です（秘密鍵ではありません）。
// - 本当に守るべきなのは Firestore/Storage の Security Rules 側です。
//   読み書きが不要に開放されていないか、必ず Rules を確認してください。
// - Service Account（private_key）などは絶対にフロントへ入れないでください。

const firebaseConfig = {
  apiKey: "REMOVED_GOOGLE_API_KEY",
  authDomain: "character-mkr.firebaseapp.com",
  projectId: "character-mkr",
  storageBucket: "character-mkr.firebasestorage.app",
  messagingSenderId: "887208611673",
  appId: "1:887208611673:web:8882cdd29dbe84777f0648",
  measurementId: "G-J9GN1M1Y9N"
};
const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);

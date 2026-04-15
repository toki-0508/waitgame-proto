import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBVTJ65sQ5VzeK1UtfryshcvzU5tumiDGU",
  authDomain: "character-mkr.firebaseapp.com",
  projectId: "character-mkr",
  storageBucket: "character-mkr.firebasestorage.app",
  messagingSenderId: "887208611673",
  appId: "1:887208611673:web:8882cdd29dbe84777f0648",
  measurementId: "G-J9GN1M1Y9N"
};
const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);
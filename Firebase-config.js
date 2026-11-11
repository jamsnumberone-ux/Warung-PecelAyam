import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "API_KEY_LU",
  authDomain: "PROJECT_ID_LU.firebaseapp.com",
  projectId: "PROJECT_ID_LU",
  storageBucket: "PROJECT_ID_LU.appspot.com",
  messagingSenderId: "SENDER_ID_LU",
  appId: "APP_ID_LU"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

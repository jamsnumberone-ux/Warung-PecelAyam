import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAq-g27icEVPbCWcKu0zy8n0-FGtuFPMY4",
  authDomain: "warung-pecel-ayam.firebaseapp.com",
  projectId: "warung-pecel-ayam",
  storageBucket: "warung-pecel-ayam.firebasestorage.app",
  messagingSenderId: "282204921225",
  appId: "1:282204921225:web:2a9fe3cd28171584f09558",
  measurementId: "G-HCKK40E24N"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

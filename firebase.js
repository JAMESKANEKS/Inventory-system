// firebase.js
// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAqy5uBShZljUBBgaMZ1IBPRXlq5rSGkC0",
  authDomain: "inventory-system-9f77c.firebaseapp.com",
  projectId: "inventory-system-9f77c",
  storageBucket: "inventory-system-9f77c.firebasestorage.app",
  messagingSenderId: "178281900675",
  appId: "1:178281900675:web:1b787dc7d3714b7f4a89b6",
  measurementId: "G-L6CWCT6J7B"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore and Auth
const db = getFirestore(app);
const auth = getAuth(app);

// Export so other files (app.js, auth.js) can use them
export { db, auth };

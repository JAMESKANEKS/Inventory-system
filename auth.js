import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// 🔹 Register
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("Account created successfully!");
      window.location.href = "index.html";
    } catch (err) {
      alert(err.message);
    }
  });
}

// 🔹 Login
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "index.html";
    } catch (err) {
      alert(err.message);
    }
  });
}

// 🔹 Protect pages
onAuthStateChanged(auth, (user) => {
  const currentPage = window.location.pathname.split("/").pop();

  if (!user && currentPage === "index.html") {
    window.location.href = "login.html";
  }

  if (user && (currentPage === "login.html" || currentPage === "register.html")) {
    window.location.href = "index.html";
  }
});

// 🔹 Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
}

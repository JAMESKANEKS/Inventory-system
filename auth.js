import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Predefined admin credentials
const ADMIN_EMAIL = "admin@inventory.com";
const ADMIN_PASSWORD = "Admin@123";
const STAFF_EMAIL = "staff@inventory.com";
const STAFF_PASSWORD = "Staff@123";

// Initialize default admin and staff accounts
async function initializeDefaultAccounts() {
  try {
    console.log('Initializing default accounts...');
    
    // First, try to create the admin account
    try {
      const adminCredential = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
      console.log('Admin auth account created');
      
      // Create user document
      await setDoc(doc(db, 'users', ADMIN_EMAIL), {
        email: ADMIN_EMAIL,
        role: 'admin',
        name: 'Administrator',
        createdAt: new Date().toISOString()
      });
      console.log('Admin Firestore document created');
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        console.log('Admin account already exists');
      } else {
        console.error('Error with admin account:', error);
      }
    }
    
    // Then, try to create the staff account
    try {
      const staffCredential = await createUserWithEmailAndPassword(auth, STAFF_EMAIL, STAFF_PASSWORD);
      console.log('Staff auth account created');
      
      // Create user document
      await setDoc(doc(db, 'users', STAFF_EMAIL), {
        email: STAFF_EMAIL,
        role: 'staff',
        name: 'Staff Member',
        createdAt: new Date().toISOString()
      });
      console.log('Staff Firestore document created');
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        console.log('Staff account already exists');
      } else {
        console.error('Error with staff account:', error);
      }
    }
  } catch (error) {
    console.error("Error initializing default accounts:", error);
  }
}

// Call the initialization function when the page loads
if (document.readyState !== 'loading') {
  initializeDefaultAccounts();
} else {
  document.addEventListener('DOMContentLoaded', initializeDefaultAccounts);
}

// 🔹 Login
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const loginBtn = document.querySelector('#loginForm button[type="submit"]');
    
    try {
      // Show loading state
      loginBtn.disabled = true;
      loginBtn.textContent = 'Signing in...';
      
      console.log('Attempting to sign in with:', email);
      
      // Try to sign in
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('Authentication successful');
        
        // Check if user exists in Firestore
        const userDoc = await getDoc(doc(db, 'users', email));
        
        if (userDoc.exists()) {
          // Store user role in session storage
          const userData = userDoc.data();
          const userRole = userData.role || 'staff';
          sessionStorage.setItem('userRole', userRole);
          sessionStorage.setItem('userEmail', email);
          console.log('User role set to:', userRole);
          
          // Add admin class to body if user is admin
          if (userRole === 'admin') {
            document.body.classList.add('admin');
          }
          
          window.location.href = "index.html";
        } else {
          // This should not happen for default accounts
          console.error('User authenticated but no Firestore document found');
          throw new Error('User account not properly configured');
        }
      } catch (authError) {
        console.error('Authentication error:', authError);
        
        // If it's a wrong password error, show specific message
        if (authError.code === 'auth/wrong-password') {
          throw new Error('Incorrect password. Please try again.');
        }
        
        // If user not found, try to create default accounts and log in
        if (authError.code === 'auth/user-not-found') {
          console.log('User not found, initializing default accounts...');
          await initializeDefaultAccounts();
          
          // Try to sign in again after creating accounts
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          console.log('Successfully logged in after account creation');
          
          // Set default role based on email
          const role = email === ADMIN_EMAIL ? 'admin' : 'staff';
          const name = email === ADMIN_EMAIL ? 'Administrator' : 'Staff Member';
          
          // Create user document
          await setDoc(doc(db, 'users', email), {
            email: email,
            role: role,
            name: name,
            createdAt: new Date().toISOString()
          });
          
          sessionStorage.setItem('userRole', role);
          sessionStorage.setItem('userEmail', email);
          console.log('User document created with role:', role);
          window.location.href = "index.html";
        } else {
          throw authError; // Re-throw other errors
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      alert("Login failed. Please check your email and password and try again.");
    } finally {
      // Reset login button state
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
      }
    }
  });
}

// Function to update UI based on user role
function updateUIForUserRole(role) {
  // Add or remove admin class from body
  if (role === 'admin') {
    document.body.classList.add('admin');
  } else {
    document.body.classList.remove('admin');
  }
  
  // Update user info in the header
  const userEmailElement = document.getElementById('userEmail');
  if (userEmailElement) {
    const email = auth.currentUser?.email || sessionStorage.getItem('userEmail');
    userEmailElement.textContent = email || 'User';
    if (role) {
      userEmailElement.innerHTML += ` <small>(${role})</small>`;
    }
  }
}

// 🔹 Protect pages and handle role-based access
onAuthStateChanged(auth, async (user) => {
  const currentPage = window.location.pathname.split("/").pop();

  if (!user) {
    // Clear any existing role data
    sessionStorage.removeItem('userRole');
    document.body.classList.remove('admin');
    
    if (currentPage !== "login.html") {
      window.location.href = "login.html";
    }
    return;
  }

  // User is logged in
  if (currentPage === "login.html") {
    window.location.href = "index.html";
    return;
  }

  // Get user role
  try {
    const userDoc = await getDoc(doc(db, 'users', user.email));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const userRole = userData.role || 'staff';
      
      // Store user data in session storage
      sessionStorage.setItem('userRole', userRole);
      sessionStorage.setItem('userEmail', user.email);
      
      // Update UI based on role
      updateUIForUserRole(userRole);
    } else {
      // If user document doesn't exist, treat as staff by default
      console.warn('User document not found, defaulting to staff role');
      updateUIForUserRole('staff');
    }
  } catch (error) {
    console.error("Error getting user data:", error);
    // Default to staff role on error
    updateUIForUserRole('staff');
  }
});

// 🔹 Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      sessionStorage.removeItem('userRole');
      window.location.href = "login.html";
    } catch (error) {
      console.error("Logout error:", error);
    }
  });
}

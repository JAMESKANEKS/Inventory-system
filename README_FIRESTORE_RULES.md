Firestore Security Rules and Cloud Function sample

1) Firestore rules (basic role-based access)

-- Save these in the Firebase console or `firestore.rules` --

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Public read for products, but restrict writes
    match /products/{productId} {
      allow read: if true;
      allow create, update, delete: if isAdmin() || isStaff();
    }

    // Logs: write allowed for authenticated users (client writes created by UI)
    match /logs/{logId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if isAdmin();
    }

    // Users collection: only admins can write. Users can read their own doc.
    match /users/{userId} {
      allow read: if request.auth != null && (isAdmin() || request.auth.uid == userId);
      allow write: if isAdmin();
    }

    function isAdmin() {
      return request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin';
    }
    function isStaff() {
      return request.auth != null && (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Staff');
    }
  }
}

Notes:
- Client-side role checks are not secure by themselves. Use these rules to enforce access server-side.
- The rules above read the user's role from `users/{uid}`. Ensure the `users` documents are created and maintained securely.

2) Cloud Function sample (Node.js) — create Auth user and user doc

// index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.createUser = functions.https.onCall(async (data, context) => {
  // only allow admins to call
  const callerUid = context.auth.uid;
  const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can create users');
  }

  const { email, password, displayName, role } = data;
  if (!email || !password) throw new functions.https.HttpsError('invalid-argument', 'Email and password required');

  const userRecord = await admin.auth().createUser({ email, password, displayName });
  // Optionally set custom claims
  await admin.auth().setCustomUserClaims(userRecord.uid, { role });
  // Create corresponding Firestore doc
  await admin.firestore().doc(`users/${userRecord.uid}`).set({
    email,
    displayName: displayName || '',
    role: role || 'Viewer',
    disabled: false,
    createdBy: callerUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { uid: userRecord.uid };
});

Usage:
- Deploy this Cloud Function and then call it from your client using the Firebase Functions client SDK `httpsCallable('createUser')`.
- This avoids signing out the admin and ensures the Auth account and Firestore doc are created together.

Security reminder:
- Protect admin operations and validate inputs. Use strong authentication and monitor activity in Audit logs.

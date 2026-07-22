// Paste your Firebase web app config below (Project settings → Your apps → SDK setup).
// Create project: https://console.firebase.google.com/
// Then: Build → Realtime Database → Create database → start in test mode (or use the rules below).
//
// Rules (Realtime Database → Rules):
// {
//   "rules": {
//     "checklist": {
//       ".read": true,
//       ".write": true
//     }
//   }
// }
window.JF_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

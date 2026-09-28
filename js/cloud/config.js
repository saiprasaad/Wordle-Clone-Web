// Firebase project settings for accounts and cloud sync. These values are
// public by design: every Firebase web app ships them to the browser, and
// firestore.rules decides who can read or write what.
//
// null turns accounts off. Local copies (localhost) never use this project:
// they try accounts against the Firebase emulators with ?emulators instead
// (see the README).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDc_gzJT2BEAgdRemL2HdhhFSoEONQvFz4',
  authDomain: 'voila-47296.firebaseapp.com',
  projectId: 'voila-47296',
  storageBucket: 'voila-47296.firebasestorage.app',
  messagingSenderId: '126025132637',
  appId: '1:126025132637:web:cb7a6cdf593de038e4bbb4',
};

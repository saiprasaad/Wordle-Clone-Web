// Google sign-in and the player's cloud record, via Firebase. The SDK comes
// from Google's CDN the first time it's needed, so players who never sign in
// never download it.

import { FIREBASE_CONFIG } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
// Used with ?emulators on localhost; "demo-" projects never reach real servers.
const EMULATOR_PROJECT = {
  apiKey: 'demo-key',
  authDomain: 'demo-wordle.firebaseapp.com',
  projectId: 'demo-wordle',
};

function usesEmulators() {
  const { hostname, search } = window.location;
  return new URLSearchParams(search).has('emulators') && ['localhost', '127.0.0.1'].includes(hostname);
}

export function cloudAvailable() {
  return Boolean(FIREBASE_CONFIG) || usesEmulators();
}

let connection = null;

/** Loads Firebase once and returns the few operations the game needs. */
export function connectCloud() {
  connection ??= load().catch((error) => {
    connection = null; // Let a later attempt retry, e.g. back online.
    throw error;
  });
  return connection;
}

async function load() {
  const [{ initializeApp }, authSdk, store] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore-lite.js`),
  ]);
  const emulators = usesEmulators();
  const app = initializeApp(emulators ? EMULATOR_PROJECT : FIREBASE_CONFIG);
  const auth = authSdk.getAuth(app);
  const db = store.getFirestore(app);
  if (emulators) {
    authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    store.connectFirestoreEmulator(db, '127.0.0.1', 8085);
  }
  const playerRecord = (uid) => store.doc(db, 'players', uid);
  const google = () => new authSdk.GoogleAuthProvider();

  return {
    onUserChange: (callback) => authSdk.onAuthStateChanged(auth, callback),
    signIn: () =>
      emulators
        ? authSdk.signInWithCredential(auth, emulatorCredential(authSdk))
        : authSdk.signInWithPopup(auth, google()),
    signOut: () => authSdk.signOut(auth),

    /**
     * Reads the player's record and hands it to `update`, which returns
     * `{ next, write }`: the merged profile, and the data to store (or null
     * when the record is already up to date). Runs as a transaction, so edits
     * from two devices at once can't overwrite each other.
     */
    sync: (uid, update) =>
      store.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(playerRecord(uid));
        const { next, write } = update(snapshot.exists() ? snapshot.data() : null);
        if (write) transaction.set(playerRecord(uid), write);
        return next;
      }),

    /** Deletes the cloud record and the account, after the player confirms with Google. */
    async deleteAccount() {
      const user = auth.currentUser;
      await (emulators
        ? authSdk.reauthenticateWithCredential(user, emulatorCredential(authSdk))
        : authSdk.reauthenticateWithPopup(user, google()));
      await store.deleteDoc(playerRecord(user.uid));
      await authSdk.deleteUser(user);
    },
  };
}

/**
 * With the emulators, Google's sign-in window is replaced by a stand-in Google
 * identity that the Auth emulator accepts without a real account. Tests pick
 * the identity through sessionStorage; otherwise a default one is used.
 */
function emulatorCredential(authSdk) {
  let identity = null;
  try {
    identity = JSON.parse(sessionStorage.getItem('wordle-clone:emulator-user'));
  } catch {
    // Use the default below.
  }
  const { email, name } = identity ?? { email: 'player@example.com', name: 'Test Player' };
  const token = JSON.stringify({ sub: `google-${email}`, email, name, email_verified: true });
  return authSdk.GoogleAuthProvider.credential(token);
}

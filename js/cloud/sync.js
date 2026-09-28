// Keeps this device and the player's cloud record in step while they're signed
// in. The game never waits for the network: every change is saved locally
// first and synced in the background.

import { mergeProfiles, readProfile, sameProfile } from '../profile.js';
import * as storage from '../storage.js';
import { cloudAvailable, connectCloud } from './firebase.js';

const SYNC_DELAY_MS = 1000;
const REFRESH_AFTER_MS = 15_000;

/**
 * `getProfile()` returns this device's profile, `applyProfile(profile)` adopts
 * a merged one, and `onChange(state)` hears about sign-in and sync status.
 */
export function createSync({ device, getProfile, applyProfile, onChange }) {
  let cloud = null;
  let user = null;
  // signed-out | connecting | syncing | synced | offline | error
  let status = 'signed-out';
  let timer = null;
  let running = false;
  let again = false;
  let lastSynced = 0;

  function state() {
    return {
      available: cloudAvailable(),
      status,
      user: user && { name: user.displayName ?? '', email: user.email ?? '' },
    };
  }

  function setStatus(next) {
    status = next;
    onChange(state());
  }

  async function attach() {
    if (cloud) return cloud;
    const connected = await connectCloud();
    if (!cloud) {
      cloud = connected;
      cloud.onUserChange((next) => {
        user = next;
        if (user) {
          storage.save('account', true);
          syncNow();
        } else {
          storage.remove('account');
          setStatus('signed-out');
        }
      });
    }
    return cloud;
  }

  async function syncNow() {
    if (!user) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    clearTimeout(timer);
    setStatus('syncing');
    try {
      const merged = await cloud.sync(user.uid, (stored) => {
        const local = getProfile();
        const remote = stored ? readProfile(stored, { device }) : null;
        const next = remote ? mergeProfiles(local, remote) : local;
        return { next, write: remote && sameProfile(next, remote) ? null : toCloud(next) };
      });
      lastSynced = Date.now();
      applyProfile(merged);
      setStatus('synced');
    } catch (error) {
      setStatus(navigator.onLine === false || error?.code === 'unavailable' ? 'offline' : 'error');
    } finally {
      running = false;
      if (again) {
        again = false;
        syncNow();
      }
    }
  }

  return {
    get state() {
      return state();
    },

    /** Reconnects a player who signed in on an earlier visit. */
    async start() {
      if (!cloudAvailable() || !storage.load('account', false) || cloud) return;
      setStatus('connecting');
      try {
        await attach();
      } catch {
        setStatus('offline');
      }
    },

    /** Loads Firebase ahead of a likely sign-in so the pop-up opens straight from the tap. */
    prepare() {
      if (cloudAvailable()) attach().catch(() => {});
    },

    async signIn() {
      setStatus('connecting');
      try {
        // No await before signIn() when Firebase is ready: browsers only allow
        // pop-ups that open directly from a tap.
        const connected = cloud ?? (await attach());
        await connected.signIn();
      } catch (error) {
        setStatus(user ? 'synced' : 'signed-out');
        throw error;
      }
    },

    async signOut() {
      await cloud?.signOut();
    },

    async deleteAccount() {
      await cloud.deleteAccount();
    },

    /** Call after any local change: syncs shortly after, batching quick edits. */
    changed() {
      if (!user) return;
      clearTimeout(timer);
      timer = setTimeout(syncNow, SYNC_DELAY_MS);
    },

    /** Picks up changes made on other devices, e.g. when the game is shown again. */
    refresh() {
      if (user && Date.now() - lastSynced > REFRESH_AFTER_MS) syncNow();
    },
  };
}

// Firestore rejects undefined values, which a JSON round trip drops.
function toCloud(profile) {
  return { ...JSON.parse(JSON.stringify(profile)), updatedAt: Date.now() };
}

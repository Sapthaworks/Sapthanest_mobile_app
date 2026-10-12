import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
  remove,
  update,
  Unsubscribe,
} from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { DeviceStates, RelayKey, TriacKey, SapthaDevice } from '../types/device';

export interface DiscoveredCloudDevice {
  id: string;
  name: string;
  ip: string;
  mdns?: string;
  online?: boolean;
  ownerId?: string | null;
}

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCKzEltsiwm0WELhbU64BeQiop-c_ESCyA',
  databaseURL: 'https://sapthanest-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'sapthanest-default-rtdb',
};

const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
const db = getDatabase(app);
const FIREBASE_BASE_URL = FIREBASE_CONFIG.databaseURL;

/**
 * Checks if the current Firebase user is anonymous or unauthenticated.
 */
export const isAnonymousUser = (): boolean => {
  try {
    const auth = getAuth(app);
    return !auth.currentUser || auth.currentUser.isAnonymous;
  } catch {
    return true;
  }
};

/**
 * Resolves the active user ID (defaults to 'default_user' if unauthenticated).
 */
export const getEffectiveUserId = (fallbackUserId: string = 'default_user'): string => {
  try {
    const auth = getAuth(app);
    return auth.currentUser?.uid || fallbackUserId;
  } catch {
    return fallbackUserId;
  }
};

/**
 * Persists the user's configured room list to Firebase RTDB.
 * Blocked for anonymous/guest users.
 */
export const syncRoomsToCloud = async (userId: string, rooms: string[]): Promise<void> => {
  if (isAnonymousUser()) return;
  const effectiveUid = getEffectiveUserId(userId);
  try {
    await set(ref(db, `users/${effectiveUid}/rooms`), rooms);
  } catch (err: any) {
    console.warn('[Firebase] Failed to sync rooms to cloud:', err.message);
  }
};

/**
 * Fetches all rooms stored under the user's cloud account.
 * Returns an empty array for anonymous users.
 */
export const fetchUserRooms = async (userId: string): Promise<string[]> => {
  if (isAnonymousUser()) return [];
  const effectiveUid = getEffectiveUserId(userId);
  try {
    const snapshot = await get(ref(db, `users/${effectiveUid}/rooms`));
    if (snapshot.exists()) {
      const data = snapshot.val();
      return Array.isArray(data) ? data : Object.values(data);
    }
    return [];
  } catch (err: any) {
    console.warn('[Firebase] Failed to fetch rooms from cloud:', err.message);
    return [];
  }
};

/**
 * Deletes a room from the user's room list in Firebase RTDB.
 * Handles both Array and Object/Dictionary room schemas.
 */
export const deleteRoomFromFirebase = async (
  userId: string,
  roomName: string
): Promise<void> => {
  if (isAnonymousUser()) return;

  const effectiveUid = getEffectiveUserId(userId);
  const roomsRef = ref(db, `users/${effectiveUid}/rooms`);

  try {
    const snapshot = await get(roomsRef);
    if (snapshot.exists()) {
      const data = snapshot.val();

      if (Array.isArray(data)) {
        const filteredRooms = data.filter((r) => r !== roomName);
        await set(roomsRef, filteredRooms);
      } else if (typeof data === 'object' && data !== null) {
        let matchedKey: string | null = null;
        for (const [key, val] of Object.entries(data)) {
          if (val === roomName || key === roomName) {
            matchedKey = key;
            break;
          }
        }

        if (matchedKey) {
          await remove(ref(db, `users/${effectiveUid}/rooms/${matchedKey}`));
        } else {
          await remove(ref(db, `users/${effectiveUid}/rooms/${encodeURIComponent(roomName)}`));
        }
      }
    }
  } catch (err: any) {
    console.warn('[Firebase] SDK room removal failed, invoking REST fallback:', err.message);
    try {
      // Direct REST fallback attempt
      const res = await fetch(`${FIREBASE_BASE_URL}/users/${effectiveUid}/rooms.json`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const filteredRooms = data.filter((r) => r !== roomName);
          await fetch(`${FIREBASE_BASE_URL}/users/${effectiveUid}/rooms.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filteredRooms),
          });
        } else if (typeof data === 'object' && data !== null) {
          const keyToDelete = Object.keys(data).find(
            (k) => data[k] === roomName || k === roomName
          );
          if (keyToDelete) {
            await fetch(
              `${FIREBASE_BASE_URL}/users/${effectiveUid}/rooms/${encodeURIComponent(keyToDelete)}.json`,
              { method: 'DELETE' }
            );
          }
        }
      }
    } catch (restErr: any) {
      console.error('[Firebase] Failed to delete room via REST:', restErr.message);
    }
  }
};

/**
 * Links a board to a user in Firebase and establishes default switch/triac states.
 * Blocked for anonymous users.
 */
export const linkDeviceToUser = async (
  userId: string,
  device: SapthaDevice
): Promise<void> => {
  if (isAnonymousUser()) {
    return;
  }

  const effectiveUid = getEffectiveUserId(userId);

  try {
    // 1. User device reference
    const userDeviceRef = ref(db, `users/${effectiveUid}/devices/${device.id}`);
    await set(userDeviceRef, {
      id: device.id,
      name: device.name,
      room: device.room,
      mdns: device.mdns,
      ip: device.ip,
      linkedAt: Date.now(),
    });

    // 2. Hardware device metadata
    const deviceMetaRef = ref(db, `devices/${device.id}/meta`);
    await update(deviceMetaRef, {
      nodeId: device.id,
      ip: device.ip,
      name: device.name,
      mdns: device.mdns,
      ownerId: effectiveUid,
      room: device.room,
      online: true,
    });

    // 3. Ensure hardware states default cleanly (relays false, triacs 0)
    const deviceStateRef = ref(db, `devices/${device.id}/state`);
    const existingState = await get(deviceStateRef);
    if (!existingState.exists()) {
      await set(deviceStateRef, {
        r1: false,
        r2: false,
        r3: false,
        r4: false,
        t1: 0,
        t2: 0,
      });
    }
  } catch (err: any) {
    console.error(`[Firebase] Failed to link board ${device.id}:`, err.message);

    // REST Fallback
    try {
      await fetch(
        `${FIREBASE_BASE_URL}/users/${effectiveUid}/devices/${device.id}.json`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: device.id,
            name: device.name,
            room: device.room,
            mdns: device.mdns,
            ip: device.ip,
            linkedAt: Date.now(),
          }),
        }
      );
    } catch (restErr: any) {
      throw new Error(`Cloud sync failed: ${restErr.message}`);
    }
  }
};

/**
 * Removes a board from both the user's registry and the global hardware table.
 * Blocked for anonymous users.
 */
export const unlinkDeviceFromUser = async (
  userId: string,
  deviceId: string
): Promise<void> => {
  if (isAnonymousUser()) return;

  const effectiveUid = getEffectiveUserId(userId);

  try {
    await remove(ref(db, `users/${effectiveUid}/devices/${deviceId}`));
    await remove(ref(db, `devices/${deviceId}`));
  } catch (err: any) {
    console.warn('[Firebase] SDK removal failed, invoking REST delete:', err.message);
    try {
      await fetch(
        `${FIREBASE_BASE_URL}/users/${effectiveUid}/devices/${deviceId}.json`,
        { method: 'DELETE' }
      );
      await fetch(`${FIREBASE_BASE_URL}/devices/${deviceId}.json`, {
        method: 'DELETE',
      });
    } catch (restErr: any) {
      console.error('[Firebase] Failed to remove device via REST:', restErr.message);
    }
  }
};

/**
 * Real-time listener for board hardware states.
 * Disabled for anonymous users to prevent rule permission errors.
 */
export const subscribeToDeviceState = (
  deviceId: string,
  onStateUpdate: (states: DeviceStates) => void
): Unsubscribe => {
  if (isAnonymousUser()) {
    return () => {};
  }

  try {
    const stateRef = ref(db, `devices/${deviceId}/state`);
    return onValue(
      stateRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          onStateUpdate({
            r1: Boolean(data.r1),
            r2: Boolean(data.r2),
            r3: Boolean(data.r3),
            r4: Boolean(data.r4),
            t1: typeof data.t1 === 'number' ? data.t1 : 0,
            t2: typeof data.t2 === 'number' ? data.t2 : 0,
          });
        }
      },
      (error) => {
        console.warn(`[Firebase] State listener blocked for ${deviceId}:`, error.message);
      }
    );
  } catch {
    return () => {};
  }
};

/**
 * Updates an individual channel's state in Firebase RTDB.
 * Blocked for anonymous users.
 */
export const updateChannelState = async (
  deviceId: string,
  channel: RelayKey | TriacKey,
  value: boolean | number
): Promise<void> => {
  if (isAnonymousUser()) return;

  try {
    const channelRef = ref(db, `devices/${deviceId}/state/${channel}`);
    await set(channelRef, value);
  } catch (err: any) {
    console.error(`[Firebase] Failed to update channel ${channel}:`, err.message);
    try {
      await fetch(`${FIREBASE_BASE_URL}/devices/${deviceId}/state/${channel}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
    } catch {
      // ignore REST fallback error
    }
  }
};

/**
 * Fetches all boards linked to a specific user.
 * Returns an empty array for anonymous users.
 */
export const fetchUserDevices = async (
  userId?: string
): Promise<any[]> => {
  if (isAnonymousUser()) return [];

  const effectiveUid = getEffectiveUserId(userId || 'default_user');
  try {
    const snapshot = await get(ref(db, `users/${effectiveUid}/devices`));
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (Array.isArray(data)) {
        return data.filter(Boolean);
      }
      return Object.keys(data).map((k) => ({ ...data[k], id: k }));
    }
    return [];
  } catch {
    return [];
  }
};

export default {
  isAnonymousUser,
  getEffectiveUserId,
  syncRoomsToCloud,
  fetchUserRooms,
  deleteRoomFromFirebase,
  linkDeviceToUser,
  unlinkDeviceFromUser,
  subscribeToDeviceState,
  updateChannelState,
  fetchUserDevices,
};
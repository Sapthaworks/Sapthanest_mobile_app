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
  mac?: string;
  token?: string;
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

export const isAnonymousUser = (): boolean => {
  try {
    const auth = getAuth(app);
    return !auth.currentUser || auth.currentUser.isAnonymous;
  } catch {
    return true;
  }
};

export const getEffectiveUserId = (fallbackUserId: string = 'default_user'): string => {
  try {
    const auth = getAuth(app);
    return auth.currentUser?.uid || fallbackUserId;
  } catch {
    return fallbackUserId;
  }
};

export const syncRoomsToCloud = async (userId: string, rooms: string[]): Promise<void> => {
  if (isAnonymousUser()) return;
  const effectiveUid = getEffectiveUserId(userId);
  try {
    await set(ref(db, `users/${effectiveUid}/rooms`), rooms);
  } catch (err: any) {
    console.warn('[Firebase] Failed to sync rooms to cloud:', err.message);
  }
};

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

export const linkDeviceToUser = async (
  userId: string,
  device: SapthaDevice
): Promise<void> => {
  if (isAnonymousUser()) return;

  const effectiveUid = getEffectiveUserId(userId);

  try {
    // 1. User device registration
    const userDeviceRef = ref(db, `users/${effectiveUid}/devices/${device.id}`);
    await set(userDeviceRef, {
      id: device.id,
      name: device.name,
      room: device.room,
      mdns: device.mdns,
      ip: device.ip,
      mac: device.mac || null,
      token: device.token || null,
      linkedAt: Date.now(),
    });

    // 2. Hardware device metadata registration
    const deviceMetaRef = ref(db, `devices/${device.id}/meta`);
    await update(deviceMetaRef, {
      nodeId: device.id,
      ip: device.ip,
      name: device.name,
      mdns: device.mdns,
      mac: device.mac || null,
      ownerId: effectiveUid,
      room: device.room,
      online: true,
    });

    // 3. Save board secret token to Firebase if present
    if (device.token) {
      const secretRef = ref(db, `devices/${device.id}/secret`);
      await set(secretRef, device.token);
    }

    // 4. Default hardware channel states
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
  }
};

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
  }
};

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
  linkDeviceToUser,
  unlinkDeviceFromUser,
  subscribeToDeviceState,
  updateChannelState,
  fetchUserDevices,
};
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SapthaDevice, RelayKey, TriacKey } from '../types/device';

const SAVED_DEVICES_KEY = '@sapthanest_devices';
const USER_SESSION_KEY = '@sapthanest_user_session';
const SAVED_ROOMS_KEY = '@sapthanest_rooms';

export interface UserSession {
  userId?: string;
  email?: string;
  token?: string;
  isLoggedIn: boolean;
}

export const loadUserSession = async (): Promise<UserSession | null> => {
  try {
    const raw = await AsyncStorage.getItem(USER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Failed to load user session:', error);
    return null;
  }
};

export const saveUserSession = async (session: UserSession): Promise<void> => {
  try {
    await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to save user session:', error);
  }
};

export const clearUserSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(USER_SESSION_KEY);
  } catch (error) {
    console.error('Failed to clear user session:', error);
  }
};

export const clearAllUserData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      USER_SESSION_KEY,
      SAVED_DEVICES_KEY,
      SAVED_ROOMS_KEY,
    ]);
  } catch (error) {
    console.error('Failed to purge user data on logout:', error);
  }
};

export const clearUserDataOnSignOut = clearAllUserData;

export const getSavedDevices = async (): Promise<SapthaDevice[]> => {
  try {
    const raw = await AsyncStorage.getItem(SAVED_DEVICES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Failed to load saved devices:', error);
    return [];
  }
};

export const saveDeviceToStorage = async (device: SapthaDevice): Promise<SapthaDevice[]> => {
  try {
    const existing = await getSavedDevices();
    const filtered = existing.filter((d) => d.id !== device.id);
    const updated = [...filtered, device];
    await AsyncStorage.setItem(SAVED_DEVICES_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to save device:', error);
    throw error;
  }
};

export const saveAllDevices = async (devices: SapthaDevice[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(SAVED_DEVICES_KEY, JSON.stringify(devices));
  } catch (error) {
    console.error('Failed to save bulk devices:', error);
    throw error;
  }
};

export const deleteDeviceFromStorage = async (deviceId: string): Promise<SapthaDevice[]> => {
  try {
    const existing = await getSavedDevices();
    const updated = existing.filter((d) => d.id !== deviceId);
    await AsyncStorage.setItem(SAVED_DEVICES_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to delete device:', error);
    throw error;
  }
};

export const updateDeviceChannelLabelInStorage = async (
  deviceId: string,
  channel: RelayKey | TriacKey,
  newLabel: string
): Promise<SapthaDevice[]> => {
  try {
    const existing = await getSavedDevices();
    const updated = existing.map((device) => {
      if (device.id === deviceId) {
        return {
          ...device,
          labels: {
            ...(device.labels || {}),
            [channel]: newLabel,
          },
        };
      }
      return device;
    });
    await AsyncStorage.setItem(SAVED_DEVICES_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error(`Failed to update label for device ${deviceId}:`, error);
    throw error;
  }
};

export const getSavedRooms = async (): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(SAVED_ROOMS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (typeof item === 'string' ? item : item?.name || 'Room'));
    }
    return [];
  } catch {
    return [];
  }
};

export const saveRoomsToStorage = async (rooms: string[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(rooms));
  } catch (error) {
    console.error('Failed to save rooms list:', error);
    throw error;
  }
};

export const saveRoomToStorage = async (roomName: string): Promise<string[]> => {
  try {
    const existing = await getSavedRooms();
    if (!existing.includes(roomName)) {
      const updated = [...existing, roomName];
      await AsyncStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(updated));
      return updated;
    }
    return existing;
  } catch (error) {
    console.error('Failed to save room:', error);
    throw error;
  }
};

export const renameRoomInStorage = async (
  oldName: string,
  newName: string
): Promise<{ updatedRooms: string[]; updatedDevices: SapthaDevice[] }> => {
  try {
    const [savedRooms, savedDevices] = await Promise.all([
      getSavedRooms(),
      getSavedDevices(),
    ]);

    const updatedRooms = savedRooms.map((r) => (r === oldName ? newName : r));
    const updatedDevices = savedDevices.map((d) =>
      d.room === oldName ? { ...d, room: newName } : d
    );

    await Promise.all([
      AsyncStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(updatedRooms)),
      AsyncStorage.setItem(SAVED_DEVICES_KEY, JSON.stringify(updatedDevices)),
    ]);

    return { updatedRooms, updatedDevices };
  } catch (error) {
    console.error(`Failed to rename room from "${oldName}" to "${newName}":`, error);
    throw error;
  }
};

export const deleteRoomAndItsDevices = async (roomName: string): Promise<void> => {
  try {
    const [savedRooms, savedDevices] = await Promise.all([
      getSavedRooms(),
      getSavedDevices(),
    ]);

    const remainingRooms = savedRooms.filter((r) => r !== roomName);
    const remainingDevices = savedDevices.filter((d) => d.room !== roomName);

    await Promise.all([
      AsyncStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(remainingRooms)),
      AsyncStorage.setItem(SAVED_DEVICES_KEY, JSON.stringify(remainingDevices)),
    ]);
  } catch (error) {
    console.error(`Failed to delete room ${roomName} and its devices:`, error);
    throw error;
  }
};

export default {
  loadUserSession,
  saveUserSession,
  clearUserSession,
  clearAllUserData,
  clearUserDataOnSignOut,
  getSavedDevices,
  saveDeviceToStorage,
  saveAllDevices,
  deleteDeviceFromStorage,
  updateDeviceChannelLabelInStorage,
  getSavedRooms,
  saveRoomsToStorage,
  saveRoomToStorage,
  renameRoomInStorage,
  deleteRoomAndItsDevices,
};
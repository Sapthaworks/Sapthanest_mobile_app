import { DeviceStates, RelayKey, TriacKey } from '../types/device';
import { updateChannelState } from './deviceService';

export interface DiscoveredDevice {
  ip: string;
  nodeId: string;
  name?: string;
  preset?: string;
  mdns?: string;
  states?: DeviceStates;
}

export interface TargetDeviceParams {
  id: string;
  mdns?: string;
  ip?: string;
}

const FIREBASE_BASE_URL = 'https://sapthanest-default-rtdb.asia-southeast1.firebasedatabase.app';

/**
 * Probes an address for the /api/status endpoint with a timeout.
 */
export const probeDeviceAtAddress = async (
  address: string,
  timeoutMs: number = 1000
): Promise<DiscoveredDevice | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const cleanHost = address.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const targetUrl = `http://${cleanHost}/api/status`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) return null;

    const data = await response.json();
    if (data && (data.nodeId || data.states)) {
      return {
        ip: data.ip || cleanHost,
        nodeId: data.nodeId || 'SapthaNest-Node',
        name: data.name || data.nodeId || 'SapthaNest Board',
        preset: data.preset || '4relay_2triac',
        mdns: data.mdns || cleanHost,
        states: {
          r1: Boolean(data.states?.r1),
          r2: Boolean(data.states?.r2),
          r3: Boolean(data.states?.r3),
          r4: Boolean(data.states?.r4),
          t1: typeof data.states?.t1 === 'number' ? data.states.t1 : 0,
          t2: typeof data.states?.t2 === 'number' ? data.states.t2 : 0,
        },
      };
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
};

/**
 * Queries Firebase RTDB directly for all boards that reported an active dynamic IP.
 * Guarantees discovery in APKs even if the Android phone blocks local broadcast packets.
 */
export const fetchReportedDevicesFromCloud = async (): Promise<DiscoveredDevice[]> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${FIREBASE_BASE_URL}/devices.json`, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (!data) return [];

      const devices: DiscoveredDevice[] = [];
      Object.keys(data).forEach((key) => {
        const item = data[key];
        const meta = item?.meta || {};
        const state = item?.state || {};

        if (meta.ip || item.ip) {
          const suffix = key.replace(/^.*?-/, '').toLowerCase();
          devices.push({
            nodeId: key,
            ip: meta.ip || item.ip,
            name: meta.name || key,
            preset: meta.preset || '4relay_2triac',
            mdns: meta.mdns || `sapthanest-board-${suffix}.local`,
            states: {
              r1: Boolean(state.r1),
              r2: Boolean(state.r2),
              r3: Boolean(state.r3),
              r4: Boolean(state.r4),
              t1: typeof state.t1 === 'number' ? state.t1 : 0,
              t2: typeof state.t2 === 'number' ? state.t2 : 0,
            },
          });
        }
      });
      return devices;
    }
  } catch (err) {
    console.warn('[Discovery] Cloud fetch fallback error:', err);
  }
  return [];
};

/**
 * Low-level HTTP POST dispatcher to the ESP32 /api/channel endpoint.
 */
const rawSendCommand = async (
  host: string,
  channel: string,
  state: boolean,
  value: number
): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);

  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = `http://${cleanHost}/api/channel`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        state,
        value: channel.includes('t') ? value : state ? 1 : 0,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
};

export const sendChannelCommand = async (
  host: string,
  channel: string,
  state: boolean,
  value: number = 0
): Promise<boolean> => {
  return await rawSendCommand(host, channel, state, value);
};

/**
 * Executes a 3-tier cascaded command:
 * 1. Local dynamic mDNS domain (`http://<mdns>/api/channel`)
 * 2. Local direct IP address (`http://<ip>/api/channel`)
 * 3. Firebase Cloud Realtime Database fallback (`/devices/<id>/state/<channel>`)
 */
export const sendDynamicChannelCommand = async (
  device: TargetDeviceParams,
  channelKey: RelayKey | TriacKey | string,
  state: boolean,
  value: number = 0
): Promise<boolean> => {
  const compoundId = `${device.id}_${channelKey}`;

  // 1. Try local mDNS
  if (device.mdns) {
    const mdnsSuccess = await rawSendCommand(device.mdns, compoundId, state, value);
    if (mdnsSuccess) return true;
  }

  // 2. Try direct local IP
  if (device.ip) {
    const ipSuccess = await rawSendCommand(device.ip, compoundId, state, value);
    if (ipSuccess) return true;
  }

  // 3. Cloud Fallback via Firebase Realtime Database
  try {
    const cleanChannel = (channelKey.includes('_')
      ? channelKey.split('_').pop()
      : channelKey) as RelayKey | TriacKey;

    const cloudPayload = cleanChannel.startsWith('r') ? state : value;
    await updateChannelState(device.id, cleanChannel, cloudPayload);
    return true;
  } catch (cloudErr) {
    console.warn(`[Routing] Cloud fallback failed for board ${device.id}:`, cloudErr);
    return false;
  }
};

export default {
  probeDeviceAtAddress,
  fetchReportedDevicesFromCloud,
  sendChannelCommand,
  sendDynamicChannelCommand,
};
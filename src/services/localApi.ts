import { DeviceStates } from '../types/device';

export interface DiscoveredDevice {
  nodeId: string;
  name?: string;
  ip: string;
  mac?: string;
  token?: string;
  mdns?: string;
  states?: DeviceStates;
}

export const probeDeviceAtAddress = async (
  ip: string,
  timeoutMs: number = 800,
  token?: string
): Promise<DiscoveredDevice | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {};
    if (token) headers['X-Saptha-Key'] = token;

    const res = await fetch(`http://${ip}/api/status`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.nodeId) {
        return {
          nodeId: data.nodeId,
          name: data.name || data.nodeId,
          ip: ip,
          mac: data.mac || undefined,
          token: data.token || undefined,
          mdns: data.mdns || undefined,
          states: data.states || undefined,
        };
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export const fetchReportedDevicesFromCloud = async (): Promise<DiscoveredDevice[]> => {
  return [];
};

export const sendDynamicChannelCommand = async (
  target: { id?: string; mdns?: string; ip?: string; token?: string },
  channel: string,
  state: boolean,
  value: number = 0
): Promise<boolean> => {
  const payload = {
    channel: `_${channel}`,
    state: state,
    value: value,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (target.token) {
    headers['X-Saptha-Key'] = target.token;
  }

  const hostsToTry: string[] = [];
  if (target.ip) hostsToTry.push(target.ip);
  if (target.mdns) hostsToTry.push(target.mdns);

  for (const host of hostsToTry) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);

      const res = await fetch(`http://${host}/api/channel`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (res.ok) return true;
    } catch {
      // Continue to next host
    }
  }

  return false;
};

export default {
  probeDeviceAtAddress,
  fetchReportedDevicesFromCloud,
  sendDynamicChannelCommand,
};
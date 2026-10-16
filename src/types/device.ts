export type RelayKey = 'r1' | 'r2' | 'r3' | 'r4';
export type TriacKey = 't1' | 't2';

export interface DeviceStates {
  r1: boolean;
  r2: boolean;
  r3: boolean;
  r4: boolean;
  t1: number;
  t2: number;
}

// Custom channel label mapping (e.g., { r1: "Bed Lamp", t1: "Ceiling Fan" })
export type DeviceChannelLabels = Partial<Record<RelayKey | TriacKey, string>>;

export type DeviceConnectionMode = 'local' | 'cloud';

export interface SapthaDevice {
  id: string;
  name: string;
  room: string;
  ip: string;
  type: string;
  online: boolean;
  token?: string;
  mac?: string;
  mdns?: string;
  addedAt?: number;
  connectionMode?: DeviceConnectionMode;
  states?: DeviceStates;
  labels?: DeviceChannelLabels; // <--- Add this line
}
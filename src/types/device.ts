// Relay and Triac channel keys matching the ESP32 hardware firmware
export type RelayKey = 'r1' | 'r2' | 'r3' | 'r4';
export type TriacKey = 't1' | 't2';
export type ChannelKey = RelayKey | TriacKey;

// Real-time state payload received from or sent to /devices/{deviceId}/state
export interface DeviceStates {
  r1: boolean;
  r2: boolean;
  r3: boolean;
  r4: boolean;
  t1: number; // Dimmer / Fan speed level (0 - 100 or 0 - 255)
  t2: number;
}

// Supported board hardware profiles
export type DeviceType = '4-relay' | '2-relay-dimmer' | 'smart-switch';

// Origin/connectivity classification
export type DeviceConnectionMode = 'local' | 'cloud';

// Core device model stored locally in AsyncStorage and displayed on dashboard screens
export interface SapthaDevice {
  id: string;                         // Unique device / MAC / board ID (e.g., "sapthanest-c45a")
  name: string;                       // User-friendly display name (e.g., "Living Room Switch")
  ip: string;                         // Local network IP address for direct mDNS/REST access
  room: string;                       // Assigned room name (e.g., "Living Room", "Master Bedroom")
  type: DeviceType;                   // Hardware type profile
  online?: boolean;                   // Connection status
  mdns?: string;                      // Local mDNS hostname (e.g., "sapthanest-board-c45a.local")
  states?: DeviceStates;              // Current active channel states
  addedAt?: number;                   // Epoch timestamp when board was paired
  connectionMode?: DeviceConnectionMode; // 'local' (LAN/mDNS) vs 'cloud' (Firebase RTDB)
}

// Room grouping representation
export interface Room {
  id: string;
  name: string;
  deviceCount?: number;
}
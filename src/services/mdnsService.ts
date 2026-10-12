// src/services/mdnsService.ts
import Zeroconf from 'react-native-zeroconf';
import { DiscoveredDevice } from './localApi';

const zeroconf = new Zeroconf();

export const discoverMdnsDevices = (
  timeoutMs: number = 4000,
  onDeviceFound?: (device: DiscoveredDevice) => void
): Promise<DiscoveredDevice[]> => {
  return new Promise((resolve) => {
    const foundDevices: DiscoveredDevice[] = [];

    // Fired when an mDNS service resolves host & IP
    const onResolved = (service: any) => {
      console.log('[mDNS Resolved]', service);

      // Check if service matches our ESP32 mDNS announcements
      const isSaptha =
        service.name?.toLowerCase().includes('sapthanest') ||
        service.host?.toLowerCase().includes('sapthanest') ||
        service.txt?.nodeId;

      if (isSaptha && service.addresses && service.addresses.length > 0) {
        // Filter for IPv4
        const ipv4 = service.addresses.find((addr: string) => addr.includes('.')) || service.addresses[0];
        
        const device: DiscoveredDevice = {
          ip: ipv4,
          nodeId: service.txt?.nodeId || service.name || 'SapthaNest-Node',
          name: service.name || 'Living Room Board',
          preset: service.txt?.preset || '4relay_2triac',
        };

        if (!foundDevices.some((d) => d.nodeId === device.nodeId)) {
          foundDevices.push(device);
          if (onDeviceFound) {
            onDeviceFound(device);
          }
        }
      }
    };

    const onError = (err: any) => {
      console.warn('[mDNS Error]', err);
    };

    zeroconf.on('resolved', onResolved);
    zeroconf.on('error', onError);

    // Scan for HTTP services (_http._tcp.) or custom (_sapthanest._tcp.)
    console.log('[mDNS] Scanning for local services...');
    zeroconf.scan('http', 'tcp', 'local.');

    // Stop scanning after the timeout
    setTimeout(() => {
      zeroconf.stop();
      zeroconf.removeListener('resolved', onResolved);
      zeroconf.removeListener('error', onError);
      resolve(foundDevices);
    }, timeoutMs);
  });
};
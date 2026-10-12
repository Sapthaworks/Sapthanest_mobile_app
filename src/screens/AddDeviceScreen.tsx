import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  probeDeviceAtAddress,
  fetchReportedDevicesFromCloud,
  DiscoveredDevice,
} from '../services/localApi';
import { getSavedDevices, saveDeviceToStorage } from '../services/storage';
import { linkDeviceToUser } from '../services/deviceService';
import { SapthaDevice, DeviceConnectionMode } from '../types/device';

interface AddDeviceScreenProps {
  navigation: any;
  route?: {
    params?: {
      roomName?: string;
      userId?: string;
    };
  };
}

interface DetectedNetwork {
  ssid: string;
  rssi: number;
}

interface DiscoveredDeviceWithMode extends DiscoveredDevice {
  connectionMode: DeviceConnectionMode;
}

async function requestScanPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const isAlreadyGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      if (isAlreadyGranted) return true;

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location & Wi-Fi Permission',
          message: 'SapthaNest requires network access to discover ESP32 boards on your network.',
          buttonPositive: 'Allow',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }
  return true;
}

export const AddDeviceScreen: React.FC<AddDeviceScreenProps> = ({ navigation, route }) => {
  const targetRoom = route?.params?.roomName || 'Living Room';
  const currentUserId = route?.params?.userId || 'default_user';

  const [isSearching, setIsSearching] = useState(true);
  const [searchStatus, setSearchStatus] = useState('Initiating scan...');
  const [secondsRemaining, setSecondsRemaining] = useState(20);

  const [setupBoard, setSetupBoard] = useState<DiscoveredDevice | null>(null);
  const [scannedSsids, setScannedSsids] = useState<DetectedNetwork[]>([]);
  const [selectedSsid, setSelectedSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionModalVisible, setProvisionModalVisible] = useState(false);

  const [discoveredBoards, setDiscoveredBoards] = useState<DiscoveredDeviceWithMode[]>([]);
  const isCancelledRef = useRef(false);

  const getDynamicDomain = (nodeId: string, fallbackMdns?: string): string => {
    if (fallbackMdns) return fallbackMdns;
    const suffix = nodeId.replace(/^.*?-/, '').toLowerCase();
    return `sapthanest-board-${suffix}.local`;
  };

  const storeAndFinish = useCallback(
    async (device: DiscoveredDeviceWithMode) => {
      let liveStates = device.states;

      if (!liveStates || Object.keys(liveStates).length === 0) {
        try {
          const fresh = await probeDeviceAtAddress(device.ip, 1500);
          if (fresh?.states) liveStates = fresh.states;
        } catch {
          // ignore probe error
        }
      }

      const dynamicDomain = getDynamicDomain(device.nodeId, device.mdns);

      const sapthaDev: SapthaDevice = {
        id: device.nodeId,
        name: device.name || `${targetRoom} Controller`,
        room: targetRoom,
        ip: device.ip,
        type: '4-relay',
        online: true,
        mdns: dynamicDomain,
        addedAt: Date.now(),
        connectionMode: device.connectionMode,
        states: {
          r1: liveStates?.r1 ?? false,
          r2: liveStates?.r2 ?? false,
          r3: liveStates?.r3 ?? false,
          r4: liveStates?.r4 ?? false,
          t1: liveStates?.t1 ?? 0,
          t2: liveStates?.t2 ?? 0,
        },
      };

      try {
        await saveDeviceToStorage(sapthaDev);
        await linkDeviceToUser(currentUserId, sapthaDev);
      } catch (err) {
        console.warn('Failed to link device to cloud user:', err);
      }

      setDiscoveredBoards((prev) => prev.filter((d) => d.nodeId !== device.nodeId));

      Alert.alert(
        'Board Linked',
        `Bound "${dynamicDomain}" (${device.connectionMode === 'local' ? 'Local Wi-Fi' : 'Cloud'}) to ${targetRoom}.`,
        [
          { text: 'Open Room', onPress: () => navigation.goBack() },
          { text: 'Add Another Board', style: 'cancel' },
        ]
      );
    },
    [targetRoom, currentUserId, navigation]
  );

  const fetchSsidsFromBoard = async () => {
    try {
      const res = await fetch('http://192.168.4.1/api/scan', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data.networks && Array.isArray(data.networks)) {
          const unique: DetectedNetwork[] = [];
          data.networks.forEach((item: DetectedNetwork) => {
            if (item.ssid && !unique.some((u) => u.ssid === item.ssid)) {
              unique.push(item);
            }
          });
          setScannedSsids(unique);
          if (unique.length > 0 && !selectedSsid) {
            setSelectedSsid(unique[0].ssid);
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const executeSearch = useCallback(async () => {
    isCancelledRef.current = false;
    setIsSearching(true);
    setSetupBoard(null);
    setDiscoveredBoards([]);
    setSecondsRemaining(20);

    await requestScanPermissions();

    const existingDevices = await getSavedDevices();
    const existingIds = new Set(existingDevices.map((d) => d.id));
    const existingDomains = new Set(
      existingDevices.map((d) => (d.mdns ? d.mdns.toLowerCase() : ''))
    );

    const isAlreadyAdded = (nodeId: string, mdns?: string): boolean => {
      if (existingIds.has(nodeId)) return true;
      const domain = getDynamicDomain(nodeId, mdns).toLowerCase();
      return existingDomains.has(domain);
    };

    const foundMap = new Map<string, DiscoveredDeviceWithMode>();

    const registerFoundBoard = (board: DiscoveredDevice, mode: DeviceConnectionMode) => {
      if (!isAlreadyAdded(board.nodeId, board.mdns)) {
        if (!foundMap.has(board.nodeId) || mode === 'local') {
          foundMap.set(board.nodeId, { ...board, connectionMode: mode });
          setDiscoveredBoards(Array.from(foundMap.values()));
        }
      }
    };

    const startTime = Date.now();
    const totalDuration = 20000;

    const intervalTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((totalDuration - elapsed) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(intervalTimer);
      }
    }, 1000);

    // Phase 1: SoftAP 192.168.4.1 Check
    setSearchStatus('Checking for setup mode (192.168.4.1)...');
    let detectedApBoard: DiscoveredDevice | null = null;
    const setupDeadline = Date.now() + 5000;

    while (Date.now() < setupDeadline && !isCancelledRef.current) {
      try {
        const apProbe = await probeDeviceAtAddress('192.168.4.1', 1000);
        if (apProbe && !isCancelledRef.current) {
          if (!isAlreadyAdded(apProbe.nodeId, apProbe.mdns)) {
            detectedApBoard = apProbe;
            break;
          }
        }
      } catch {
        // Retry probe
      }

      if (Date.now() < setupDeadline) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    if (detectedApBoard && !isCancelledRef.current) {
      clearInterval(intervalTimer);
      setSetupBoard(detectedApBoard);
      fetchSsidsFromBoard();
      setIsSearching(false);
      setSecondsRemaining(0);
      setSearchStatus(`Setup mode board detected (${detectedApBoard.nodeId}).`);
      return;
    }

    if (isCancelledRef.current) {
      clearInterval(intervalTimer);
      return;
    }

    // Phase 2: Cloud Registry Fetch + Multi-Subnet Sweep
    setSearchStatus('Checking cloud device registry...');
    try {
      const cloudDevices = await fetchReportedDevicesFromCloud();
      cloudDevices.forEach((dev) => registerFoundBoard(dev, 'cloud'));
    } catch {
      // ignore
    }

    const subnets = ['192.168.0', '192.168.1', '192.168.29'];

    for (const prefix of subnets) {
      if (isCancelledRef.current || Date.now() - startTime >= totalDuration) break;

      setSearchStatus(`Scanning local ${prefix}.x subnet...`);
      const batchSize = 35;

      for (let start = 1; start <= 254; start += batchSize) {
        if (isCancelledRef.current || Date.now() - startTime >= totalDuration) break;

        const end = Math.min(start + batchSize - 1, 254);
        const batchPromises: Promise<DiscoveredDevice | null>[] = [];

        for (let i = start; i <= end; i++) {
          batchPromises.push(probeDeviceAtAddress(`${prefix}.${i}`, 650));
        }

        const results = await Promise.all(batchPromises);
        results.forEach((item) => {
          if (item) {
            registerFoundBoard(item, 'local');
          }
        });
      }
    }

    const totalElapsed = Date.now() - startTime;
    if (totalElapsed < totalDuration && !isCancelledRef.current) {
      await new Promise((r) => setTimeout(r, totalDuration - totalElapsed));
    }

    clearInterval(intervalTimer);

    if (!isCancelledRef.current) {
      setIsSearching(false);
      setSecondsRemaining(0);
      const total = foundMap.size;
      setSearchStatus(
        total > 0
          ? `Scan complete. Found ${total} new board(s).`
          : 'Scan complete. No new boards detected.'
      );
    }
  }, []);

  useEffect(() => {
    executeSearch();
    return () => {
      isCancelledRef.current = true;
    };
  }, [executeSearch]);

  const handleProvisionSubmit = async () => {
    if (!selectedSsid.trim()) {
      Alert.alert('Required', 'Please enter your Wi-Fi SSID.');
      return;
    }

    setIsProvisioning(true);
    setSearchStatus('Transmitting Wi-Fi credentials...');

    try {
      const res = await fetch('http://192.168.4.1/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: selectedSsid.trim(), password: wifiPassword }),
      });

      if (res.ok) {
        setIsProvisioning(false);
        setProvisionModalVisible(false);
        setSetupBoard(null);

        Alert.alert(
          'Wi-Fi Configured',
          `ESP32 is rebooting and joining "${selectedSsid}". Connect your phone back to your home Wi-Fi and tap scan to add it to ${targetRoom}.`,
          [
            {
              text: 'Scan Home Network',
              onPress: () => {
                executeSearch();
              },
            },
          ]
        );
      } else {
        throw new Error('Board rejected provisioning data');
      }
    } catch {
      setIsProvisioning(false);
      Alert.alert(
        'Error',
        'Could not communicate with setup gateway. Ensure your phone remains connected to the board hotspot.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Device to {targetRoom}</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={executeSearch} disabled={isSearching}>
            <Text style={[styles.refreshText, isSearching && { opacity: 0.5 }]}>Rescan</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusRibbon}>
          {isSearching ? (
            <ActivityIndicator size="small" color="#38bdf8" style={{ marginRight: 8 }} />
          ) : (
            <Text
              style={[
                styles.statusDot,
                discoveredBoards.length > 0 || setupBoard ? styles.dotGreen : styles.dotGray,
              ]}
            >
              ●
            </Text>
          )}
          <Text style={styles.statusText} numberOfLines={1}>
            {searchStatus}
          </Text>
          {isSearching && (
            <Text style={styles.timerBadge}>{secondsRemaining}s</Text>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollArea}>
          {setupBoard && (
            <View style={styles.cardPrimary}>
              <Text style={styles.cardTitle}>Setup Mode Board Detected</Text>
              <Text style={styles.cardSubtitle}>{setupBoard.nodeId}</Text>
              <Text style={styles.cardDomainText}>Gateway: 192.168.4.1 (SoftAP)</Text>
              <TouchableOpacity
                style={styles.actionBtnPrimary}
                onPress={() => setProvisionModalVisible(true)}
              >
                <Text style={styles.actionBtnText}>Configure Home Wi-Fi</Text>
              </TouchableOpacity>
            </View>
          )}

          {discoveredBoards.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.sectionHeader}>
                Network Boards ({discoveredBoards.length})
              </Text>
              {discoveredBoards.map((board) => {
                const isLocal = board.connectionMode === 'local';
                const domain = getDynamicDomain(board.nodeId, board.mdns);

                return (
                  <View
                    key={board.nodeId}
                    style={[
                      styles.cardSuccess,
                      isLocal ? styles.cardBorderLocal : styles.cardBorderCloud,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.badgeRow}>
                        <Text style={styles.cardTitle}>{board.name || board.nodeId}</Text>
                        <View
                          style={[
                            styles.connectionBadge,
                            isLocal ? styles.badgeLocal : styles.badgeCloud,
                          ]}
                        >
                          <View
                            style={[
                              styles.badgeDot,
                              { backgroundColor: isLocal ? '#10b981' : '#38bdf8' },
                            ]}
                          />
                          <Text
                            style={[
                              styles.badgeText,
                              { color: isLocal ? '#34d399' : '#38bdf8' },
                            ]}
                          >
                            {isLocal ? 'Local Wi-Fi' : 'Cloud Registry'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.cardSubtitle}>{board.nodeId}</Text>
                      <Text style={styles.cardDomainText}>
                        {isLocal
                          ? `LAN: ${board.ip} (${domain})`
                          : 'Synced via Firebase RTDB'}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.actionBtnSuccess,
                        isLocal ? styles.btnLocal : styles.btnCloud,
                      ]}
                      onPress={() => storeAndFinish(board)}
                    >
                      <Text style={styles.actionBtnText}>+ Add</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {!isSearching && discoveredBoards.length === 0 && !setupBoard && (
            <View style={styles.guideCard}>
              <Text style={styles.guideTitle}>No New Boards Discovered</Text>
              <Text style={styles.guideText}>
                • All active boards on this network are already assigned to a room.{'\n'}
                • Ensure unassigned boards are connected to the same Wi-Fi network as this phone.{'\n'}
                • For a fresh board, connect to "SapthaNest-Setup-XXXX" (Password: nest1234) and configure it first.
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={executeSearch}>
                <Text style={styles.retryBtnText}>Scan Again (20s)</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <Modal visible={provisionModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalHeading}>Wi-Fi Setup</Text>
              {scannedSsids.length > 0 && (
                <ScrollView style={{ maxHeight: 110, marginVertical: 8 }}>
                  {scannedSsids.map((item) => (
                    <TouchableOpacity
                      key={item.ssid}
                      style={[styles.ssidChip, selectedSsid === item.ssid && styles.ssidChipActive]}
                      onPress={() => setSelectedSsid(item.ssid)}
                    >
                      <Text
                        style={[
                          styles.ssidText,
                          selectedSsid === item.ssid && styles.ssidTextActive,
                        ]}
                      >
                        {item.ssid}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TextInput
                style={styles.textInput}
                value={selectedSsid}
                onChangeText={setSelectedSsid}
                placeholder="Wi-Fi SSID"
                placeholderTextColor="#64748b"
              />
              <TextInput
                style={[styles.textInput, { marginTop: 10 }]}
                value={wifiPassword}
                onChangeText={setWifiPassword}
                placeholder="Wi-Fi Password"
                placeholderTextColor="#64748b"
                secureTextEntry
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setProvisionModalVisible(false)}>
                  <Text style={{ color: '#94a3b8' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleProvisionSubmit}
                  disabled={isProvisioning}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '700' }}>
                    {isProvisioning ? 'Sending...' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0b0f19' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  backBtn: { padding: 4 },
  backBtnText: { color: '#38bdf8', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  refreshBtn: { padding: 4 },
  refreshText: { color: '#38bdf8', fontSize: 14, fontWeight: '600' },
  statusRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statusDot: { fontSize: 12, marginRight: 8 },
  dotGreen: { color: '#10b981' },
  dotGray: { color: '#64748b' },
  statusText: { color: '#94a3b8', fontSize: 13, flex: 1 },
  timerBadge: {
    color: '#38bdf8',
    fontWeight: '700',
    fontSize: 12,
    backgroundColor: '#0c4a6e',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  scrollArea: { padding: 16 },
  sectionHeader: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  cardPrimary: {
    backgroundColor: '#0c4a6e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  cardSuccess: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardBorderLocal: {
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  cardBorderCloud: {
    borderLeftWidth: 4,
    borderLeftColor: '#0284c7',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeLocal: {
    backgroundColor: '#064e3b',
    borderWidth: 1,
    borderColor: '#059669',
  },
  badgeCloud: {
    backgroundColor: '#0c4a6e',
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardTitle: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  cardSubtitle: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  cardDomainText: { color: '#38bdf8', fontSize: 12, marginTop: 2, fontWeight: '600' },
  actionBtnPrimary: {
    backgroundColor: '#38bdf8',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  actionBtnSuccess: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginLeft: 12,
  },
  btnLocal: {
    backgroundColor: '#10b981',
  },
  btnCloud: {
    backgroundColor: '#0284c7',
  },
  actionBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  guideCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  guideTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  guideText: { color: '#94a3b8', fontSize: 13, lineHeight: 20, marginTop: 8 },
  retryBtn: {
    backgroundColor: '#0284c7',
    padding: 12,
    borderRadius: 8,
    marginTop: 14,
    alignItems: 'center',
  },
  retryBtnText: { color: '#ffffff', fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  modalHeading: { color: '#ffffff', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  ssidChip: {
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 6,
    marginVertical: 3,
  },
  ssidChipActive: { backgroundColor: '#0284c7' },
  ssidText: { color: '#94a3b8' },
  ssidTextActive: { color: '#ffffff', fontWeight: '700' },
  textInput: {
    backgroundColor: '#1e293b',
    color: '#ffffff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn: { padding: 10, marginRight: 10 },
  saveBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
});

export default AddDeviceScreen;
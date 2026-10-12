import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../services/firebase';
import { RelayCard } from '../components/RelayCard';
import { TriacCard } from '../components/TriacCard';
import {
  subscribeToDeviceState,
  updateChannelState,
  unlinkDeviceFromUser,
  deleteRoomFromFirebase,
} from '../services/deviceService';
import { sendDynamicChannelCommand } from '../services/localApi';
import {
  getSavedDevices,
  deleteDeviceFromStorage,
  deleteRoomAndItsDevices,
} from '../services/storage';
import { DeviceStates, RelayKey, TriacKey, SapthaDevice } from '../types/device';

export interface RoomDetailScreenProps {
  route?: {
    params?: {
      roomId?: string;
      roomName?: string;
    };
  };
  navigation?: any;
}

export const RoomDetailScreen: React.FC<RoomDetailScreenProps> = ({ route, navigation }) => {
  const roomName = route?.params?.roomName || 'Living Room';

  const [devices, setDevices] = useState<SapthaDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [states, setStates] = useState<DeviceStates>({
    r1: false,
    r2: false,
    r3: false,
    r4: false,
    t1: 0,
    t2: 0,
  });

  const loadRoomDevices = useCallback(async () => {
    try {
      const saved = await getSavedDevices();
      const roomFiltered = saved.filter((d) => d.room === roomName);
      setDevices(roomFiltered);

      if (roomFiltered.length > 0) {
        setSelectedDeviceId((prev) => {
          const stillExists = roomFiltered.some((d) => d.id === prev);
          return stillExists ? prev : roomFiltered[0].id;
        });
      } else {
        setSelectedDeviceId('');
      }
    } catch (err) {
      console.error('Error reading devices for room:', err);
    } finally {
      setLoading(false);
    }
  }, [roomName]);

  useEffect(() => {
    loadRoomDevices();
    const unsubscribe = navigation?.addListener('focus', () => {
      loadRoomDevices();
    });
    return unsubscribe;
  }, [navigation, loadRoomDevices]);

  // Real-time Cloud Stream Sync
  useEffect(() => {
    if (!selectedDeviceId) return;

    const unsubscribe = subscribeToDeviceState(selectedDeviceId, (cloudState) => {
      if (cloudState) {
        setStates(cloudState);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedDeviceId]);

  const activeDevice = devices.find((d) => d.id === selectedDeviceId);

  // Relay command dispatcher (Dynamic mDNS -> Local Dynamic IP -> Cloud)
  const handleRelayToggle = async (channel: RelayKey, nextState: boolean) => {
    if (!selectedDeviceId || !activeDevice) return;

    setStates((prev) => ({ ...prev, [channel]: nextState }));

    const localSuccess = await sendDynamicChannelCommand(
      {
        id: activeDevice.id,
        mdns: activeDevice.mdns,
        ip: activeDevice.ip,
      },
      channel,
      nextState,
      0
    );

    if (!localSuccess) {
      try {
        await updateChannelState(selectedDeviceId, channel, nextState);
      } catch (cloudErr) {
        console.error('Relay update failed:', cloudErr);
        Alert.alert('Command Failed', 'Could not reach board via dynamic mDNS or cloud.');
        setStates((prev) => ({ ...prev, [channel]: !nextState }));
      }
    }
  };

  // Triac Dimmer command dispatcher
  const handleTriacChange = async (channel: TriacKey, nextValue: number) => {
    if (!selectedDeviceId || !activeDevice) return;

    setStates((prev) => ({ ...prev, [channel]: nextValue }));

    const localSuccess = await sendDynamicChannelCommand(
      {
        id: activeDevice.id,
        mdns: activeDevice.mdns,
        ip: activeDevice.ip,
      },
      channel,
      nextValue > 0,
      nextValue
    );

    if (!localSuccess) {
      try {
        await updateChannelState(selectedDeviceId, channel, nextValue);
      } catch (cloudErr) {
        console.error('Dimmer update failed:', cloudErr);
        Alert.alert('Routing Failed', 'Unable to adjust phase regulator level.');
      }
    }
  };

  const handleDeleteDevice = (deviceId: string) => {
    Alert.alert(
      'Remove Board',
      'This will delete the board from your device and unlink it from your cloud account. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const currentUser = auth.currentUser;
              const uid = currentUser?.uid;

              const [localResult, cloudResult] = await Promise.allSettled([
                deleteDeviceFromStorage(deviceId),
                uid && !currentUser.isAnonymous
                  ? unlinkDeviceFromUser(uid, deviceId)
                  : Promise.resolve(),
              ]);

              if (localResult.status === 'rejected') {
                throw new Error('Failed to delete board from local storage.');
              }

              if (cloudResult.status === 'rejected') {
                console.warn('Cloud unlink failed or partially failed:', cloudResult.reason);
              }

              const updated = localResult.value;
              const remaining = updated.filter((d) => d.room === roomName);
              setDevices(remaining);
              setSelectedDeviceId(remaining.length > 0 ? remaining[0].id : '');
            } catch (err: any) {
              console.error('Failed to unlink device:', err);
              Alert.alert('Error', err.message || 'Failed to remove board.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteRoom = () => {
    Alert.alert(
      'Delete Room',
      `Are you sure you want to delete "${roomName}"? This will delete the room and unlink all ${devices.length} board(s) from local storage and your cloud account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Room',
          style: 'destructive',
          onPress: async () => {
            try {
              const currentUser = auth.currentUser;
              const uid = currentUser?.uid;

              if (uid && !currentUser.isAnonymous) {
                await Promise.allSettled([
                  ...devices.map((d) => unlinkDeviceFromUser(uid, d.id)),
                  deleteRoomFromFirebase(uid, roomName),
                ]);
              }

              await deleteRoomAndItsDevices(roomName);
              navigation?.goBack();
            } catch (err: any) {
              console.error('Failed to delete room:', err);
              Alert.alert('Error', 'Failed to delete room. Please try again.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Loading {roomName}...</Text>
      </SafeAreaView>
    );
  }

  const isLocal =
    activeDevice?.connectionMode === 'local' ||
    (!activeDevice?.connectionMode && Boolean(activeDevice?.ip));
  const activeDomain =
    activeDevice?.mdns ||
    (activeDevice?.id
      ? `sapthanest-board-${activeDevice.id.replace(/^.*?-/, '').toLowerCase()}.local`
      : '');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Navigation & Header Actions */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>

          <Text style={styles.roomTitle} numberOfLines={1}>
            {roomName}
          </Text>

          <View style={styles.headerActionGroup}>
            <TouchableOpacity style={styles.deleteRoomButton} onPress={handleDeleteRoom}>
              <Text style={styles.deleteRoomButtonText}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => navigation?.navigate('AddDevice', { roomName })}
            >
              <Text style={styles.scanButtonText}>+ Add ESP32</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Board Meta Banner with Dynamic Origin Badges */}
        {activeDevice ? (
          <View
            style={[
              styles.deviceMetaCard,
              isLocal ? styles.metaCardBorderLocal : styles.metaCardBorderCloud,
            ]}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <Text style={styles.deviceCardTitle}>
                  {activeDevice.name || activeDevice.id}
                </Text>
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
                    {isLocal ? 'LAN / Direct' : 'Cloud / Remote'}
                  </Text>
                </View>
              </View>

              <Text style={styles.deviceCardDomain}>
                {isLocal
                  ? `${activeDomain}\n${activeDevice.ip}`
                  : 'Synced via Firebase RTDB'}
              </Text>

              <View style={styles.statusBadgeRow}>
                <View
                  style={[
                    styles.onlineDot,
                    { backgroundColor: isLocal ? '#10b981' : '#38bdf8' },
                  ]}
                />
                <Text style={styles.statusBadgeText}>
                  {isLocal ? 'Zero-Latency Local HTTP Active' : 'Cloud EventStream Active'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => handleDeleteDevice(activeDevice.id)}
              style={styles.deleteBtn}
            >
              <Text style={styles.deleteBtnText}>Unlink</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noDeviceCard}>
            <Text style={styles.noDeviceTitle}>No ESP32 Linked</Text>
            <Text style={styles.noDeviceSub}>
              Attach a board to control AC switches in this room.
            </Text>
            <TouchableOpacity
              style={styles.noDeviceAction}
              onPress={() => navigation?.navigate('AddDevice', { roomName })}
            >
              <Text style={styles.noDeviceActionText}>+ Link New ESP32</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Board Selector Chips */}
        {devices.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {devices.map((device) => {
              const active = device.id === selectedDeviceId;
              const deviceIsLocal =
                device.connectionMode === 'local' ||
                (!device.connectionMode && Boolean(device.ip));
              return (
                <TouchableOpacity
                  key={device.id}
                  style={[
                    styles.deviceChip,
                    active && styles.deviceChipActive,
                    deviceIsLocal ? styles.deviceChipLocal : styles.deviceChipCloud,
                  ]}
                  onPress={() => setSelectedDeviceId(device.id)}
                >
                  <View
                    style={[
                      styles.chipDot,
                      { backgroundColor: deviceIsLocal ? '#10b981' : '#38bdf8' },
                    ]}
                  />
                  <Text style={[styles.deviceChipText, active && styles.deviceChipTextActive]}>
                    {device.name || device.id}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Channel Controls */}
        {activeDevice && (
          <>
            <Text style={styles.sectionTitle}>AC Relays (Switches)</Text>
            <RelayCard
              channelKey="r1"
              label="Switch 1"
              subLabel="Relay 1 • GPIO 23"
              isOn={states.r1}
              onToggle={handleRelayToggle}
            />
            <RelayCard
              channelKey="r2"
              label="Switch 2"
              subLabel="Relay 2 • GPIO 22"
              isOn={states.r2}
              onToggle={handleRelayToggle}
            />
            <RelayCard
              channelKey="r3"
              label="Switch 3"
              subLabel="Relay 3 • GPIO 21"
              isOn={states.r3}
              onToggle={handleRelayToggle}
            />
            <RelayCard
              channelKey="r4"
              label="Socket 4"
              subLabel="Relay 4 • GPIO 19"
              isOn={states.r4}
              onToggle={handleRelayToggle}
            />

            <Text style={styles.sectionTitle}>AC Phase Regulators (Dimmers)</Text>
            <TriacCard
              channelKey="t1"
              label="Ceiling Fan (Triac 1)"
              value={states.t1}
              onValueChange={handleTriacChange}
            />
            <TriacCard
              channelKey="t2"
              label="Mood Dimmer (Triac 2)"
              value={states.t2}
              onValueChange={handleTriacChange}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0b0f19' },
  container: { padding: 20, paddingBottom: 40 },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 14 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  backBtnText: { color: '#38bdf8', fontSize: 16, fontWeight: '700' },
  roomTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#f8fafc',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerActionGroup: { flexDirection: 'row', alignItems: 'center' },
  deleteRoomButton: {
    backgroundColor: '#3f1d24',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  deleteRoomButtonText: { color: '#f87171', fontWeight: '700', fontSize: 12 },
  scanButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scanButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  deviceMetaCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metaCardBorderLocal: {
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  metaCardBorderCloud: {
    borderLeftWidth: 4,
    borderLeftColor: '#0284c7',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
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
  deviceCardTitle: { fontSize: 15, fontWeight: '800', color: '#ffffff' },
  deviceCardDomain: {
    fontSize: 13,
    color: '#38bdf8',
    marginTop: 3,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#3f1d24',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  deleteBtnText: { color: '#f87171', fontWeight: '700', fontSize: 12 },
  noDeviceCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  noDeviceTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  noDeviceSub: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginBottom: 14 },
  noDeviceAction: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  noDeviceActionText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  chipRow: { flexDirection: 'row', marginBottom: 16 },
  deviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  deviceChipLocal: {
    borderColor: '#059669',
  },
  deviceChipCloud: {
    borderColor: '#0284c7',
  },
  deviceChipActive: { backgroundColor: '#0f172a' },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  deviceChipText: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },
  deviceChipTextActive: { color: '#ffffff', fontWeight: '700' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
    letterSpacing: 0.6,
  },
});

export default RoomDetailScreen;
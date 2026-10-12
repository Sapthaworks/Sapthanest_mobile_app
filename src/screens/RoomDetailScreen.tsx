import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { RelayCard } from '../components/RelayCard';
import { TriacCard } from '../components/TriacCard';
import {
  subscribeToDeviceState,
  updateChannelState,
  unlinkDeviceFromUser,
  isAnonymousUser,
} from '../services/deviceService';
import { sendDynamicChannelCommand } from '../services/localApi';
import {
  getSavedDevices,
  deleteDeviceFromStorage,
  deleteRoomAndItsDevices,
} from '../services/storage';
import { DeviceStates, RelayKey, TriacKey, SapthaDevice } from '../types/device';
import { auth } from '../services/firebase';

export interface RoomDetailScreenProps {
  route?: {
    params?: {
      roomId?: string;
      roomName?: string;
      userId?: string;
    };
  };
  navigation?: any;
}

export const RoomDetailScreen: React.FC<RoomDetailScreenProps> = ({ route, navigation }) => {
  const roomName = route?.params?.roomName || 'Living Room';
  const currentUserId = route?.params?.userId || 'default_user';

  const isGuest = auth.currentUser?.isAnonymous || isAnonymousUser();

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

  const pendingUpdatesRef = useRef<Record<string, number>>({});

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
    const unsubscribe = navigation.addListener('focus', () => {
      loadRoomDevices();
    });
    return unsubscribe;
  }, [navigation, loadRoomDevices]);

  useEffect(() => {
    if (!selectedDeviceId || isGuest) return;

    const unsubscribe = subscribeToDeviceState(selectedDeviceId, (cloudState) => {
      if (!cloudState) return;

      const now = Date.now();
      setStates((prev) => {
        const next = { ...prev };
        (['r1', 'r2', 'r3', 'r4', 't1', 't2'] as (RelayKey | TriacKey)[]).forEach((ch) => {
          const lockedUntil = pendingUpdatesRef.current[ch] || 0;
          if (now > lockedUntil) {
            (next as any)[ch] = (cloudState as any)[ch];
          }
        });
        return next;
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedDeviceId, isGuest]);

  const activeDevice = devices.find((d) => d.id === selectedDeviceId);

  const handleRelayToggle = async (channel: RelayKey, nextState: boolean) => {
    if (!selectedDeviceId || !activeDevice) return;

    pendingUpdatesRef.current[channel] = Date.now() + 1200;
    setStates((prev) => ({ ...prev, [channel]: nextState }));

    // Local request includes hardware authorization key
    const localSuccess = await sendDynamicChannelCommand(
      {
        id: activeDevice.id,
        mdns: activeDevice.mdns,
        ip: activeDevice.ip,
        token: activeDevice.token,
      },
      channel,
      nextState,
      0
    );

    if (isGuest) {
      if (!localSuccess) {
        delete pendingUpdatesRef.current[channel];
        setStates((prev) => ({ ...prev, [channel]: !nextState }));
        Alert.alert(
          'Local Connection Required',
          'Guest mode only controls devices on the local Wi-Fi network. Ensure your phone is connected to the same Wi-Fi.'
        );
      }
      return;
    }

    try {
      await updateChannelState(selectedDeviceId, channel, nextState);
    } catch (err) {
      if (!localSuccess) {
        delete pendingUpdatesRef.current[channel];
        setStates((prev) => ({ ...prev, [channel]: !nextState }));
        Alert.alert('Command Failed', 'Unable to reach board over local network or cloud.');
      }
    }
  };

  const handleTriacChange = async (channel: TriacKey, nextValue: number) => {
    if (!selectedDeviceId || !activeDevice) return;

    pendingUpdatesRef.current[channel] = Date.now() + 1000;
    setStates((prev) => ({ ...prev, [channel]: nextValue }));

    // Local request includes hardware authorization key
    const localSuccess = await sendDynamicChannelCommand(
      {
        id: activeDevice.id,
        mdns: activeDevice.mdns,
        ip: activeDevice.ip,
        token: activeDevice.token,
      },
      channel,
      nextValue > 0,
      nextValue
    );

    if (isGuest) {
      if (!localSuccess) {
        delete pendingUpdatesRef.current[channel];
        Alert.alert(
          'Local Connection Required',
          'Guest mode only controls devices on the local Wi-Fi network.'
        );
      }
      return;
    }

    try {
      await updateChannelState(selectedDeviceId, channel, nextValue);
    } catch (err) {
      if (!localSuccess) {
        delete pendingUpdatesRef.current[channel];
      }
    }
  };

  const handleDeleteDevice = (deviceId: string) => {
    Alert.alert(
      'Remove Board',
      'Are you sure you want to remove this board? It will be permanently deleted from both this phone and the cloud database.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!isGuest) {
                await unlinkDeviceFromUser(currentUserId, deviceId);
              }
              const updated = await deleteDeviceFromStorage(deviceId);
              const remaining = updated.filter((d) => d.room === roomName);
              setDevices(remaining);
              setSelectedDeviceId(remaining.length > 0 ? remaining[0].id : '');
            } catch {
              Alert.alert('Error', 'Failed to remove board.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteRoom = () => {
    Alert.alert(
      'Delete Room',
      `Delete "${roomName}"? This will permanently delete all ${devices.length} board(s) from this phone and the cloud database.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Room',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!isGuest) {
                for (const device of devices) {
                  await unlinkDeviceFromUser(currentUserId, device.id);
                }
              }
              await deleteRoomAndItsDevices(roomName);
              navigation?.goBack();
            } catch {
              Alert.alert('Error', 'Failed to delete room.');
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

  const activeDomain =
    activeDevice?.mdns ||
    (activeDevice?.id
      ? `sapthanest-board-${activeDevice.id.replace(/^.*?-/, '').toLowerCase()}.local`
      : '');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
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
              onPress={() => navigation.navigate('AddDevice', { roomName, userId: currentUserId })}
            >
              <Text style={styles.scanButtonText}>+ Add ESP32</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isGuest && (
          <View style={styles.guestNoticeBanner}>
            <Text style={styles.guestNoticeText}>
              🔒 Guest Mode: Operating strictly over local Wi-Fi. Cloud sync is disabled.
            </Text>
          </View>
        )}

        {activeDevice ? (
          <View style={styles.deviceMetaCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceCardTitle}>
                {activeDevice.name || activeDevice.id}
              </Text>
              <Text style={styles.deviceCardDomain}>{activeDomain}</Text>

              <View style={styles.statusBadgeRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.statusBadgeText}>
                  {isGuest ? 'Local Control (Secured)' : 'Cloud & Local Secured'}
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
              onPress={() => navigation.navigate('AddDevice', { roomName, userId: currentUserId })}
            >
              <Text style={styles.noDeviceActionText}>+ Link New ESP32</Text>
            </TouchableOpacity>
          </View>
        )}

        {devices.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {devices.map((device) => {
              const active = device.id === selectedDeviceId;
              return (
                <TouchableOpacity
                  key={device.id}
                  style={[styles.deviceChip, active && styles.deviceChipActive]}
                  onPress={() => setSelectedDeviceId(device.id)}
                >
                  <Text style={[styles.deviceChipText, active && styles.deviceChipTextActive]}>
                    {device.name || device.id}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

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
  centerContainer: { flex: 1, backgroundColor: '#0b0f19', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94a3b8', marginTop: 12, fontSize: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  backBtnText: { color: '#38bdf8', fontSize: 16, fontWeight: '700' },
  roomTitle: { fontSize: 19, fontWeight: '800', color: '#f8fafc', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  headerActionGroup: { flexDirection: 'row', alignItems: 'center' },
  deleteRoomButton: { backgroundColor: '#3f1d24', borderWidth: 1, borderColor: '#7f1d1d', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, marginRight: 8 },
  deleteRoomButtonText: { color: '#f87171', fontWeight: '700', fontSize: 12 },
  scanButton: { backgroundColor: '#0284c7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  scanButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  guestNoticeBanner: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#0284c7',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  guestNoticeText: { color: '#38bdf8', fontSize: 12, fontWeight: '600', textAlign: 'center' },
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
  deviceCardTitle: { fontSize: 15, fontWeight: '800', color: '#ffffff' },
  deviceCardDomain: {
    fontSize: 13,
    color: '#38bdf8',
    marginTop: 3,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10b981', marginRight: 6 },
  statusBadgeText: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
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
  noDeviceAction: { backgroundColor: '#0284c7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  noDeviceActionText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  chipRow: { flexDirection: 'row', marginBottom: 16 },
  deviceChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  deviceChipActive: { backgroundColor: '#0284c7', borderColor: '#38bdf8' },
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
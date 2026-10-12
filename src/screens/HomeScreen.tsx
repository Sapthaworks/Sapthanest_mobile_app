import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddRoomModal } from '../components/AddRoomModal';
import {
  getSavedRooms,
  saveRoomsToStorage,
  getSavedDevices,
  saveAllDevices,
  loadUserSession,
  clearAllUserData,
  UserSession,
} from '../services/storage';
import {
  fetchUserDevices,
  fetchUserRooms,
  syncRoomsToCloud,
  subscribeToDeviceState,
  isAnonymousUser,
} from '../services/deviceService';
import { SapthaDevice, DeviceStates } from '../types/device';
import { auth } from '../services/firebase';

interface HomeScreenProps {
  navigation: any;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const [rooms, setRooms] = useState<string[]>([]);
  const [devices, setDevices] = useState<SapthaDevice[]>([]);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const unsubscribersRef = useRef<{ [deviceId: string]: () => void }>({});

  const currentUser = auth.currentUser;
  const isGuest = currentUser?.isAnonymous || isAnonymousUser();
  const activeUid = currentUser?.uid || 'default_user';

  const loadData = useCallback(async () => {
    try {
      const [localRooms, localDevices, userSession] = await Promise.all([
        getSavedRooms(),
        getSavedDevices(),
        loadUserSession(),
      ]);

      let finalRooms = [...localRooms];
      let finalDevices = [...localDevices];

      // Restore rooms and boards from cloud if user is signed in
      if (!isGuest && currentUser) {
        try {
          const [cloudRooms, cloudBoards] = await Promise.all([
            fetchUserRooms(activeUid),
            fetchUserDevices(activeUid),
          ]);

          if (cloudRooms && cloudRooms.length > 0) {
            const mergedRooms = Array.from(new Set([...finalRooms, ...cloudRooms]));
            finalRooms = mergedRooms;
            await saveRoomsToStorage(finalRooms);
          }

          if (cloudBoards && cloudBoards.length > 0) {
            const devMap = new Map<string, SapthaDevice>();
            finalDevices.forEach((d) => devMap.set(d.id, d));

            cloudBoards.forEach((b: any) => {
              if (!devMap.has(b.id)) {
                const dynamicDomain =
                  b.mdns || `sapthanest-board-${b.id.replace(/^.*?-/, '').toLowerCase()}.local`;

                devMap.set(b.id, {
                  id: b.id,
                  name: b.name || `Board ${b.id.slice(-4)}`,
                  ip: b.ip || '',
                  room: b.room || (finalRooms[0] ?? 'Living Room'),
                  type: '4-relay',
                  online: b.online ?? true,
                  mdns: dynamicDomain,
                  connectionMode: 'cloud',
                  states: {
                    r1: false,
                    r2: false,
                    r3: false,
                    r4: false,
                    t1: 0,
                    t2: 0,
                  },
                });
              }
            });

            finalDevices = Array.from(devMap.values());
            await saveAllDevices(finalDevices);
          }
        } catch (syncErr) {
          console.warn('[Sync] Could not pull cloud rooms or boards:', syncErr);
        }
      }

      setRooms(finalRooms.length > 0 ? finalRooms : []);
      setDevices(finalDevices);
      setSession(userSession);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  }, [currentUser, isGuest, activeUid]);

  useEffect(() => {
    Object.values(unsubscribersRef.current).forEach((unsub) => unsub());
    unsubscribersRef.current = {};

    if (!isGuest) {
      devices.forEach((dev) => {
        if (!dev.id) return;
        const unsubscribe = subscribeToDeviceState(dev.id, (freshState: DeviceStates) => {
          setDevices((prevDevices) =>
            prevDevices.map((d) => (d.id === dev.id ? { ...d, states: freshState } : d))
          );
        });
        unsubscribersRef.current[dev.id] = unsubscribe;
      });
    }

    return () => {
      Object.values(unsubscribersRef.current).forEach((unsub) => unsub());
      unsubscribersRef.current = {};
    };
  }, [devices.map((d) => d.id).join(','), isGuest]);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleRoomCreated = async (newRoom: string) => {
    const updatedRooms = Array.from(new Set([...rooms, newRoom]));
    setRooms(updatedRooms);
    await saveRoomsToStorage(updatedRooms);

    if (!isGuest && currentUser) {
      await syncRoomsToCloud(activeUid, updatedRooms);
    }

    setIsRoomModalOpen(false);
  };


  const getRoomStats = (roomName: string) => {
    const roomDevices = devices.filter((d) => d.room === roomName);
    let activeCount = 0;

    roomDevices.forEach((dev) => {
      const s: any = dev.states || (dev as any).state;
      if (s) {
        if (s.r1) activeCount++;
        if (s.r2) activeCount++;
        if (s.r3) activeCount++;
        if (s.r4) activeCount++;
        if (s.t1 && s.t1 > 0) activeCount++;
        if (s.t2 && s.t2 > 0) activeCount++;
      }
    });

    return {
      deviceCount: roomDevices.length,
      activeCount,
    };
  };

  const userInitial = isGuest
    ? 'G'
    : currentUser?.email
    ? currentUser.email.charAt(0).toUpperCase()
    : session?.email
    ? session.email.charAt(0).toUpperCase()
    : '👤';

  const userSubtitle = isGuest
    ? 'Guest Session (Local Network)'
    : currentUser?.email || 'Select a room to control';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeftSection}>
            <TouchableOpacity
              style={[styles.avatarButton, isGuest && styles.avatarButtonGuest]}
              onPress={() => navigation.navigate('Auth')}
              activeOpacity={0.7}
            >
              <Text style={[styles.avatarText, isGuest && styles.avatarTextGuest]}>
                {userInitial}
              </Text>
            </TouchableOpacity>

            <View style={styles.titleContainer}>
              <Text style={styles.brandTitle}>SapthaNest</Text>
              <Text style={styles.tagline} numberOfLines={1}>
                {userSubtitle}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.addRoomButton}
              onPress={() => setIsRoomModalOpen(true)}
            >
              <Text style={styles.addRoomButtonText}>+ Room</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{rooms.length}</Text>
            <Text style={styles.summaryLabel}>Total Rooms</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{devices.length}</Text>
            <Text style={styles.summaryLabel}>Configured Nodes</Text>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Available Rooms</Text>
        </View>

        {rooms.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Rooms Configured</Text>
            <Text style={styles.emptySubtitle}>
              Tap "+ Room" above to begin adding rooms and linking boards.
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {rooms.map((roomName) => {
              const stats = getRoomStats(roomName);
              return (
                <TouchableOpacity
                  key={roomName}
                  style={styles.roomCard}
                  activeOpacity={0.8}
                  onPress={() =>
                    navigation.navigate('RoomDetail', {
                      roomId: roomName,
                      roomName: roomName,
                      userId: activeUid,
                    })
                  }
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.roomIcon}>🏠</Text>
                    <View
                      style={[
                        styles.statusDot,
                        stats.activeCount > 0 ? styles.statusActive : styles.statusIdle,
                      ]}
                    />
                  </View>

                  <Text style={styles.roomName} numberOfLines={1}>
                    {roomName}
                  </Text>

                  <View style={styles.statsContainer}>
                    <Text style={styles.statsText}>
                      {stats.deviceCount} {stats.deviceCount === 1 ? 'board' : 'boards'}
                    </Text>
                    <Text style={styles.activeText}>
                      {stats.activeCount > 0
                        ? `${stats.activeCount} active`
                        : 'All devices off'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <AddRoomModal
        visible={isRoomModalOpen}
        onClose={() => setIsRoomModalOpen(false)}
        onAddRoom={handleRoomCreated}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0b0f19' },
  container: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeftSection: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarButtonGuest: { borderColor: '#64748b' },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#38bdf8' },
  avatarTextGuest: { color: '#94a3b8' },
  titleContainer: { justifyContent: 'center', flex: 1 },
  brandTitle: { fontSize: 24, fontWeight: '900', color: '#f8fafc', letterSpacing: 0.5 },
  tagline: { fontSize: 12, color: '#64748b', marginTop: 2 },
  addRoomButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addRoomButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  summaryItem: { alignItems: 'center' },
  summaryNumber: { fontSize: 22, fontWeight: '800', color: '#38bdf8' },
  summaryLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: { width: 1, height: '60%', backgroundColor: '#334155' },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  addDeviceLink: { fontSize: 13, fontWeight: '700', color: '#38bdf8' },
  emptyContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 8,
  },
  emptyTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { color: '#94a3b8', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  roomCard: {
    width: '48%',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  roomIcon: { fontSize: 22 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusActive: { backgroundColor: '#10b981' },
  statusIdle: { backgroundColor: '#64748b' },
  roomName: { fontSize: 17, fontWeight: '700', color: '#f8fafc', marginBottom: 8 },
  statsContainer: { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 8 },
  statsText: { fontSize: 12, color: '#94a3b8' },
  activeText: { fontSize: 11, color: '#38bdf8', marginTop: 2, fontWeight: '600' },
});

export { HomeScreen };
export default HomeScreen;
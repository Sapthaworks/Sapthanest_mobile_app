// src/components/RoomFilter.tsx
import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';

export interface RoomFilterProps {
  rooms: any[];
  selectedRoom: string;
  onSelectRoom: (room: string) => void;
  onAddRoomPress?: () => void;
}

export const RoomFilter: React.FC<RoomFilterProps> = ({
  rooms,
  selectedRoom,
  onSelectRoom,
  onAddRoomPress,
}) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      <TouchableOpacity
        style={[styles.chip, selectedRoom === 'All' && styles.chipActive]}
        onPress={() => onSelectRoom('All')}
      >
        <Text style={[styles.chipText, selectedRoom === 'All' && styles.chipTextActive]}>
          All
        </Text>
      </TouchableOpacity>

      {rooms.map((roomItem, index) => {
        // Guard against objects being rendered as React children:
        const roomName =
          typeof roomItem === 'string'
            ? roomItem
            : roomItem?.name || roomItem?.id || `Room ${index + 1}`;
        const roomKey =
          typeof roomItem === 'string'
            ? roomItem
            : roomItem?.id || roomItem?.name || index.toString();

        const isActive = selectedRoom === roomName;

        return (
          <TouchableOpacity
            key={roomKey}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onSelectRoom(roomName)}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {roomName}
            </Text>
          </TouchableOpacity>
        );
      })}

      {onAddRoomPress && (
        <TouchableOpacity style={styles.addChip} onPress={onAddRoomPress}>
          <Text style={styles.addChipText}>+ Room</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  chipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  addChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#0284c7',
    borderStyle: 'dashed',
    marginRight: 8,
  },
  addChipText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default RoomFilter;
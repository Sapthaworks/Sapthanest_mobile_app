import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RelayKey } from '../types/device';

interface RelayCardProps {
  channelKey: RelayKey;
  label: string;
  subLabel?: string;
  isOn: boolean;
  onToggle: (channel: RelayKey, nextState: boolean) => void;
  onLongPress?: (channel: RelayKey) => void;
  disabled?: boolean;
}

export const RelayCard: React.FC<RelayCardProps> = ({
  channelKey,
  label,
  subLabel,
  isOn,
  onToggle,
  onLongPress,
  disabled = false,
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onLongPress={() => onLongPress && onLongPress(channelKey)}
      delayLongPress={500}
      style={[styles.card, isOn && styles.cardActive]}
    >
      <View style={styles.infoCol}>
        <View style={styles.titleRow}>
          <Text style={styles.label}>{label}</Text>
          <View style={[styles.statusPill, isOn ? styles.pillActive : styles.pillInactive]}>
            <Text style={[styles.statusText, isOn ? styles.statusTextActive : styles.statusTextInactive]}>
              {isOn ? 'ON' : 'OFF'}
            </Text>
          </View>
        </View>
        {subLabel ? <Text style={styles.subLabel}>{subLabel}</Text> : null}
      </View>

      <TouchableOpacity
        style={[
          styles.switchBtn,
          isOn ? styles.switchBtnActive : styles.switchBtnInactive,
          disabled && styles.disabledBtn,
        ]}
        onPress={() => onToggle(channelKey, !isOn)}
        activeOpacity={0.8}
        disabled={disabled}
      >
        <View style={[styles.switchThumb, isOn ? styles.thumbActive : styles.thumbInactive]} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardActive: {
    borderColor: '#0284c7',
    backgroundColor: '#132337',
  },
  infoCol: {
    flex: 1,
    marginRight: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  subLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillActive: {
    backgroundColor: '#064e3b',
  },
  pillInactive: {
    backgroundColor: '#334155',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusTextActive: {
    color: '#34d399',
  },
  statusTextInactive: {
    color: '#94a3b8',
  },
  switchBtn: {
    width: 54,
    height: 30,
    borderRadius: 15,
    padding: 2,
    justifyContent: 'center',
  },
  switchBtnActive: {
    backgroundColor: '#0284c7',
  },
  switchBtnInactive: {
    backgroundColor: '#334155',
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
  },
  thumbActive: {
    alignSelf: 'flex-end',
  },
  thumbInactive: {
    alignSelf: 'flex-start',
  },
  disabledBtn: {
    opacity: 0.5,
  },
});

export default RelayCard;
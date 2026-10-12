import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { RelayKey } from '../types/device';

export interface RelayCardProps {
  channelKey: RelayKey;
  label: string;
  subLabel?: string;
  isOn: boolean;
  onToggle: (channel: RelayKey, nextState: boolean) => void;
}

export const RelayCard: React.FC<RelayCardProps> = ({
  channelKey,
  label,
  subLabel,
  isOn,
  onToggle,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.subtitle}>{subLabel || (isOn ? 'ON' : 'OFF')}</Text>
      </View>
      <Switch
        value={isOn}
        onValueChange={(val) => onToggle(channelKey, val)}
        trackColor={{ false: '#334155', true: '#0284c7' }}
        thumbColor={isOn ? '#38bdf8' : '#94a3b8'}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  textContainer: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', color: '#f8fafc' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
});

export default RelayCard;
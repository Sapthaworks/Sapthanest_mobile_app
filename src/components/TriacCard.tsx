import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { TriacKey } from '../types/device';

export interface TriacCardProps {
  channelKey: TriacKey;
  label: string;
  value: number;
  onValueChange: (channel: TriacKey, nextVal: number) => void;
}

export const TriacCard: React.FC<TriacCardProps> = ({
  channelKey,
  label,
  value,
  onValueChange,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.valueText}>{value}%</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={value}
        onSlidingComplete={(val) => onValueChange(channelKey, Math.round(val))}
        minimumTrackTintColor="#38bdf8"
        maximumTrackTintColor="#334155"
        thumbTintColor="#38bdf8"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '600', color: '#f8fafc' },
  valueText: { fontSize: 16, fontWeight: '700', color: '#38bdf8' },
  slider: { width: '100%', height: 40 },
});

export default TriacCard;
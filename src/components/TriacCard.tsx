import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TriacKey } from '../types/device';

interface TriacCardProps {
  channelKey: TriacKey;
  label: string;
  value: number;
  onValueChange: (channel: TriacKey, nextValue: number) => void;
  onLongPress?: (channel: TriacKey) => void;
  disabled?: boolean;
}

const STEP_PRESETS = [0, 25, 50, 75, 100];

export const TriacCard: React.FC<TriacCardProps> = ({
  channelKey,
  label,
  value,
  onValueChange,
  onLongPress,
  disabled = false,
}) => {
  const isPowered = value > 0;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onLongPress={() => onLongPress && onLongPress(channelKey)}
      delayLongPress={500}
      style={[styles.card, isPowered && styles.cardActive]}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.subLabel}>Triac Phase Control</Text>
        </View>
        <View style={styles.valBadge}>
          <Text style={styles.valText}>{value}%</Text>
        </View>
      </View>

      <View style={styles.sliderSimulation}>
        <View style={[styles.progressTrack, { width: `${Math.min(Math.max(value, 0), 100)}%` }]} />
      </View>

      <View style={styles.presetRow}>
        {STEP_PRESETS.map((step) => {
          const isSelected = value === step;
          return (
            <TouchableOpacity
              key={step}
              style={[
                styles.presetBtn,
                isSelected && styles.presetBtnActive,
                disabled && styles.disabled,
              ]}
              onPress={() => onValueChange(channelKey, step)}
              disabled={disabled}
            >
              <Text style={[styles.presetText, isSelected && styles.presetTextActive]}>
                {step === 0 ? 'OFF' : `${step}%`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardActive: {
    borderColor: '#0284c7',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  subLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  valBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  valText: {
    color: '#38bdf8',
    fontWeight: '800',
    fontSize: 14,
  },
  sliderSimulation: {
    height: 6,
    backgroundColor: '#0f172a',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressTrack: {
    height: '100%',
    backgroundColor: '#0284c7',
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  presetText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  presetTextActive: {
    color: '#ffffff',
  },
  disabled: {
    opacity: 0.5,
  },
});

export default TriacCard;
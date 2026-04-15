/**
 * Location Permission Dialog Component
 * Custom dialog for handling location permission and settings issues
 */

import React from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, Modal, Linking, Platform, StyleSheet, useColorScheme } from "react-native";
import { Ionicons } from '@expo/vector-icons';

interface LocationPermissionDialogProps {
  visible: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  errorType?: 'permission_denied' | 'location_disabled' | 'timeout' | 'unknown';
  title?: string;
  message?: string;
}

export function LocationPermissionDialog({
  visible,
  onClose,
  onOpenSettings,
  errorType = 'unknown',
  title,
  message,
}: LocationPermissionDialogProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const getErrorContent = () => {
    switch (errorType) {
      case 'permission_denied':
        return {
          title: title || 'Location Permission Required',
          message: message || 'To use this feature, please allow location access in your device settings.',
          icon: 'location-outline' as const,
          iconColor: '#EF4444',
        };
      case 'location_disabled':
        return {
          title: title || 'Location Services Disabled',
          message: message || 'Please enable location services in your device settings to use this feature.',
          icon: 'location-outline' as const,
          iconColor: '#F59E0B',
        };
      case 'timeout':
        return {
          title: title || 'Location Timeout',
          message: message || 'Unable to get your location. Please try again or select a location manually.',
          icon: 'time-outline' as const,
          iconColor: '#F59E0B',
        };
      default:
        return {
          title: title || 'Location Unavailable',
          message: message || 'Unable to access your location. Please check your device settings or select a location manually.',
          icon: 'alert-circle-outline' as const,
          iconColor: '#6B7280',
        };
    }
  };

  const content = getErrorContent();

  const handleOpenSettings = async () => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      try {
        if (Platform.OS === 'ios') {
          await Linking.openURL('app-settings:');
        } else {
          await Linking.openSettings();
        }
      } catch (error) {
        console.error('Error opening settings:', error);
      }
    }
    onClose();
  };

  const dialogStyles = [
    styles.dialog,
    isDark && { backgroundColor: '#1F2937' },
  ];

  const titleStyles = [
    styles.title,
    isDark && { color: '#F9FAFB' },
  ];

  const messageStyles = [
    styles.message,
    isDark && { color: '#D1D5DB' },
  ];

  const cancelButtonStyles = [
    styles.cancelButton,
    isDark && { backgroundColor: '#374151' },
  ];

  const cancelButtonTextStyles = [
    styles.cancelButtonText,
    isDark && { color: '#E5E7EB' },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={dialogStyles}>
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: `${content.iconColor}20` }]}>
            <Ionicons name={content.icon} size={48} color={content.iconColor} />
          </View>

          {/* Title */}
          <Text style={titleStyles}>{content.title}</Text>

          {/* Message */}
          <Text style={messageStyles}>{content.message}</Text>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, cancelButtonStyles]}
              onPress={onClose}
            >
              <Text style={cancelButtonTextStyles}>No, thanks</Text>
            </TouchableOpacity>
            {(errorType === 'permission_denied' || errorType === 'location_disabled') && (
              <TouchableOpacity
                style={[styles.button, styles.settingsButton]}
                onPress={handleOpenSettings}
              >
                <Text style={styles.settingsButtonText}>Open Settings</Text>
              </TouchableOpacity>
            )}
            {errorType !== 'permission_denied' && errorType !== 'location_disabled' && (
              <TouchableOpacity
                style={[styles.button, styles.settingsButton]}
                onPress={onClose}
              >
                <Text style={styles.settingsButtonText}>OK</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  settingsButton: {
    backgroundColor: '#3B82F6',
  },
  settingsButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});

export default LocationPermissionDialog;

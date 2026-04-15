/**
 * Brand Alert Context
 * Provides a custom alert modal styled with driver (purple) / passenger (orange) brand colors
 * instead of the system Alert.alert.
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, Modal, TouchableOpacity, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';

const BRAND_ORANGE = '#F36D14';
const BRAND_PURPLE = '#843FE3';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
}

interface AlertState {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

interface AlertContextType {
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
}

const defaultState: AlertState = {
  title: '',
  message: '',
  buttons: [],
};

const AlertContext = createContext<AlertContextType | undefined>(undefined);

function BrandAlertModal({
  visible,
  title,
  message,
  buttons,
  onDismiss,
  brandColor,
}: {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
  onDismiss: () => void;
  brandColor: string;
}) {
  const { width } = useWindowDimensions();
  const { t } = useLanguage();
  const maxWidth = Math.min(width - 32, 340);

  const handlePress = useCallback(
    (btn: AlertButton) => {
      onDismiss();
      btn.onPress?.();
    },
    [onDismiss]
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={[styles.box, { maxWidth }]} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t(title)}</Text>
          {message ? <Text style={styles.message}>{t(message)}</Text> : null}
          <View style={styles.actions}>
            {buttons.map((btn, index) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              const isPrimary = !isCancel && !isDestructive;
              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.8}
                  onPress={() => handlePress(btn)}
                  style={[
                    styles.button,
                    isCancel && styles.buttonCancel,
                    isDestructive && styles.buttonDestructive,
                    isPrimary && { backgroundColor: brandColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel && styles.buttonTextCancel,
                      isDestructive && styles.buttonTextDestructive,
                      isPrimary && styles.buttonTextPrimary,
                    ]}
                  >
                    {t(btn.text)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const { userType } = useAuth();
  const [state, setState] = useState<AlertState>(defaultState);
  const brandColor = userType === 'driver' ? BRAND_PURPLE : BRAND_ORANGE;

  const showAlert = useCallback(
    (title: string, message?: string, buttons?: AlertButton[]) => {
      const defaultButtons: AlertButton[] = [{ text: 'OK', style: 'default' }];
      setState({
        title,
        message: message ?? '',
        buttons: buttons ?? defaultButtons,
      });
    },
    []
  );

  const hideAlert = useCallback(() => {
    setState(defaultState);
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <BrandAlertModal
        visible={state.title !== ''}
        title={state.title}
        message={state.message}
        buttons={state.buttons}
        onDismiss={hideAlert}
        brandColor={brandColor}
      />
    </AlertContext.Provider>
  );
}

export function useAlert(): AlertContextType {
  const ctx = useContext(AlertContext);
  if (ctx === undefined) {
    throw new Error('useAlert must be used within AlertProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  box: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontFamily: 'Figtree_600SemiBold',
    fontSize: 18,
    color: '#111827',
    marginBottom: 8,
  },
  message: {
    fontFamily: 'Figtree_400Regular',
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 20,
  },
  actions: {
    gap: 10,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonCancel: {
    backgroundColor: '#F3F4F6',
  },
  buttonDestructive: {
    backgroundColor: '#FEE2E2',
  },
  buttonText: {
    fontFamily: 'Figtree_600SemiBold',
    fontSize: 16,
  },
  buttonTextPrimary: {
    color: '#FFFFFF',
  },
  buttonTextCancel: {
    color: '#374151',
  },
  buttonTextDestructive: {
    color: '#DC2626',
  },
});

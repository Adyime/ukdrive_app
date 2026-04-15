/**
 * Phone Input Component with Country Code Selector
 * Supports multiple countries with flag icons
 */

import React, { useState, useCallback } from 'react';
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";
import { LocalizedText as Text } from "@/components/localized-text";
import { useLanguage } from "@/context/language-context";
import { View, TouchableOpacity, Modal, FlatList, Platform } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Country data with dial codes
export interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  phoneLength: number;
  startsWith?: string[];
}

// Common countries for ride-hailing apps
export const COUNTRIES: Country[] = [
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', phoneLength: 10, startsWith: ['5', '6', '7', '8', '9'] },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', phoneLength: 10 },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', phoneLength: 10 },
  { code: 'AE', name: 'UAE', dialCode: '+971', flag: '🇦🇪', phoneLength: 9 },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬', phoneLength: 8 },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', phoneLength: 9 },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', phoneLength: 10 },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩', phoneLength: 10 },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰', phoneLength: 10 },
  { code: 'NP', name: 'Nepal', dialCode: '+977', flag: '🇳🇵', phoneLength: 10 },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰', phoneLength: 9 },
];

interface PhoneInputProps {
  value: string;
  onChangePhone: (fullPhone: string, phoneNumber: string, country: Country) => void;
  error?: string;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  defaultCountry?: string;
  className?: string;
  disableCountryPicker?: boolean; // If true, locks to defaultCountry and hides country selector
}

export function PhoneInput({
  value,
  onChangePhone,
  error,
  label = 'Phone Number',
  placeholder = 'Enter phone number',
  autoFocus = false,
  defaultCountry = 'IN',
  className,
  disableCountryPicker = false,
}: PhoneInputProps) {
  const { t } = useLanguage();
  const INPUT_HEIGHT = 48;

  const getFlagDisplay = useCallback((country: Country) => {
    // iOS can render some regional indicator flags as tofu boxes with custom font stacks.
    // Use country code on iOS for a consistent, readable prefix.
    return Platform.OS === 'ios' ? country.code : country.flag;
  }, []);

  const [selectedCountry, setSelectedCountry] = useState<Country>(
    COUNTRIES.find(c => c.code === defaultCountry) || COUNTRIES[0]
  );
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [searchText, setSearchText] = useState('');

  // Handle phone number change
  const handlePhoneChange = useCallback((text: string) => {
    // Remove non-numeric characters
    const cleaned = text.replace(/\D/g, '');
    // Limit to expected phone length
    const limited = cleaned.slice(0, selectedCountry.phoneLength);
    setPhoneNumber(limited);
    
    // Notify parent with full phone number
    const fullPhone = `${selectedCountry.dialCode}${limited}`;
    onChangePhone(fullPhone, limited, selectedCountry);
  }, [selectedCountry, onChangePhone]);

  // Handle country selection
  const handleSelectCountry = useCallback((country: Country) => {
    setSelectedCountry(country);
    setShowCountryPicker(false);
    setSearchText('');
    
    // Update parent with new country code
    const fullPhone = `${country.dialCode}${phoneNumber}`;
    onChangePhone(fullPhone, phoneNumber, country);
  }, [phoneNumber, onChangePhone]);

  // Filter countries by search
  const filteredCountries = searchText
    ? COUNTRIES.filter(
        c =>
          c.name.toLowerCase().includes(searchText.toLowerCase()) ||
          c.dialCode.includes(searchText) ||
          c.code.toLowerCase().includes(searchText.toLowerCase())
      )
    : COUNTRIES;

  return (
    <View className={className}>
      {label && (
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </Text>
      )}

      <View className="flex-row">
        {/* Country Code Selector */}
        {disableCountryPicker ? (
          <View
            className={`flex-row items-center px-3 py-3 bg-white text-black rounded-l-lg border border-gray-200 ${
              error ? 'border-red-500' : 'border-gray-200'
            }`}
            style={{ minWidth: 90, height: INPUT_HEIGHT, paddingVertical: 0 }}
          >
            <Text className="text-sm mr-1 text-gray-700">
              {getFlagDisplay(selectedCountry)}
            </Text>
            <Text className="text-base text-black ">
              {selectedCountry.dialCode}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setShowCountryPicker(true)}
            className={`flex-row items-center px-3 py-3 bg-white text-black rounded-l-lg border border-gray-200 ${
              error ? 'border-red-500' : 'border-gray-200'
            }`}
            style={{ minWidth: 90, height: INPUT_HEIGHT, paddingVertical: 0 }}
          >
            <Text className="text-sm mr-1 text-gray-700">
              {getFlagDisplay(selectedCountry)}
            </Text>
            <Text className="text-base text-black ">
              {selectedCountry.dialCode}
            </Text>
            {/* <Ionicons name="chevron-down" size={16} color="#6B7280" style={{ marginLeft: 4 }} /> */}
          </TouchableOpacity>
        )}

        {/* Phone Number Input */}
        <View
          className={`flex-1 flex-row items-center bg-white rounded-r-lg border border-gray-200 ${
            error ? 'border-red-500' : 'border-gray-200'
          }`}
          style={{ height: INPUT_HEIGHT }}
        >
          <TextInput
            className="flex-1 px-4 text-base text-black"
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            value={phoneNumber}
            onChangeText={handlePhoneChange}
            keyboardType="phone-pad"
            autoFocus={autoFocus}
            maxLength={selectedCountry.phoneLength}
            style={{ paddingVertical: 0 }}
          />
          {phoneNumber.length > 0 && (
            <TouchableOpacity
              onPress={() => handlePhoneChange('')}
              className="pr-3"
            >
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error Message */}
      {error && (
        <Text className="text-red-500 text-sm mt-1">{error}</Text>
      )}

      {/* Phone Format Hint */}
      <Text style={{ fontFamily: 'Figtree_400Regular' }} className="text-gray-400 dark:text-gray-500 text-xs mt-1">
        {t("Enter {{digits}} digit phone number", {
          digits: selectedCountry.phoneLength,
        })}
      </Text>

      {/* Country Picker Modal */}
      {!disableCountryPicker && (
        <Modal
          visible={showCountryPicker}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowCountryPicker(false)}
        >
        <SafeAreaView className="flex-1 bg-white dark:bg-gray-900">
          {/* Header */}
          <View className="flex-row items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <TouchableOpacity
              onPress={() => {
                setShowCountryPicker(false);
                setSearchText('');
              }}
              className="p-2 -ml-2"
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
            <Text className="flex-1 text-lg font-semibold text-gray-900 dark:text-gray-100 ml-2">
              Select Country
            </Text>
          </View>

          {/* Search Input */}
          <View className="px-4 py-3">
            <View className="flex-row items-center bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">
              <Ionicons name="search" size={20} color="#9CA3AF" />
              <TextInput
                className="flex-1 ml-2 text-base text-gray-900 dark:text-gray-100"
                placeholder="Search country or code"
                placeholderTextColor="#9CA3AF"
                value={searchText}
                onChangeText={setSearchText}
                autoFocus
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText('')}>
                  <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Country List */}
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSelectCountry(item)}
                className={`flex-row items-center px-4 py-4 border-b border-gray-100 dark:border-gray-800 ${
                  selectedCountry.code === item.code ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
                }`}
              >
                <Text className="text-base mr-3 text-gray-700">
                  {getFlagDisplay(item)}
                </Text>
                <View className="flex-1">
                  <Text className="text-base text-gray-900 dark:text-gray-100">
                    {item.name}
                  </Text>
                </View>
                <Text className="text-base text-gray-500 dark:text-gray-400 mr-2">
                  {item.dialCode}
                </Text>
                {selectedCountry.code === item.code && (
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                )}
              </TouchableOpacity>
            )}
            keyboardShouldPersistTaps="handled"
          />
        </SafeAreaView>
      </Modal>
      )}
    </View>
  );
}

/**
 * Validate phone number based on country
 */
export function validatePhoneNumber(phone: string, country: Country): boolean {
  // Remove the dial code to get just the number
  const phoneNumber = phone.replace(country.dialCode, '');
  
  // Check length
  if (phoneNumber.length !== country.phoneLength) {
    return false;
  }
  
  // Check if starts with valid digits (if specified)
  if (country.startsWith && country.startsWith.length > 0) {
    const firstDigit = phoneNumber[0];
    if (!country.startsWith.includes(firstDigit)) {
      return false;
    }
  }
  
  // Check all digits
  return /^\d+$/.test(phoneNumber);
}

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phone: string, country: Country): string {
  const phoneNumber = phone.replace(country.dialCode, '');
  
  // Format based on country (simplified)
  if (country.code === 'IN' && phoneNumber.length === 10) {
    return `${country.dialCode} ${phoneNumber.slice(0, 5)} ${phoneNumber.slice(5)}`;
  }
  
  if (country.code === 'US' || country.code === 'CA') {
    if (phoneNumber.length === 10) {
      return `${country.dialCode} (${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6)}`;
    }
  }
  
  return `${country.dialCode} ${phoneNumber}`;
}

export default PhoneInput;

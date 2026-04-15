import React from "react";
import { Tabs } from "expo-router";

import { HapticTab } from "@/components/haptic-tab";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { UserRound, Car, House, Bell } from "lucide-react-native";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

export default function TabLayout() {
  const { userType } = useAuth();
  const { t, language } = useLanguage();
  const activeTint = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
  const tabFontFamily =
    language === "hi"
      ? "NotoSansDevanagari_600SemiBold"
      : "Figtree_600SemiBold";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: "#111827",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "rgba(0,0,0,0.06)",
        },
        tabBarLabelStyle: {
          fontFamily: tabFontFamily,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      {/* Home Tab */}
      <Tabs.Screen
        name="index"
        options={{
          title: t("Home"),
          tabBarIcon: ({ color }) => <House size={24} color={color} />,
          tabBarLabelStyle: { fontFamily: tabFontFamily },
        }}
      />

      {/* My Rides Tab */}
      <Tabs.Screen
        name="rides"
        options={{
          title: t("My Rides"),
          tabBarIcon: ({ color }) => <Car size={24} color={color} />,
          tabBarLabelStyle: { fontFamily: tabFontFamily },
        }}
      />



      <Tabs.Screen
        name="notifications"
        options={{
          title: t("Activity"),
          tabBarIcon: ({ color }) => <Bell size={24} color={color} />,
          tabBarLabelStyle: { fontFamily: tabFontFamily },
        }}
      />
            {/* Profile Tab - Account and settings */}
      <Tabs.Screen
        name="account"
        options={{
          title: t("Profile"),
          tabBarIcon: ({ color }) => <UserRound size={24} color={color} />,
          tabBarLabelStyle: { fontFamily: tabFontFamily },
        }}
      />

      {/* History Tab - Hidden from tab bar, accessible from Account menu */}
      <Tabs.Screen name="history" options={{ href: null }} />

      {/* Hide all other files from tab bar */}
      <Tabs.Screen
        name="create-ride"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="create-porter"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="create-car-pool"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="active-ride"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="active-porter"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="active-car-pool"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="browse-car-pools"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="manage-car-pool"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="driver-documents"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
    </Tabs>
  );
}

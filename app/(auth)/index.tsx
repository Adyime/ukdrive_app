/**
 * Welcome / Role Selection Screen
 * First screen where users choose Passenger or Driver.
 * If user has in-progress driver onboarding, redirect to resume.
 */

import { useEffect } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { getDriverOnboardingContext } from "@/lib/storage";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

export default function WelcomeScreen() {
  const router = useRouter();

  // Resume driver onboarding if user left off mid-flow (e.g. after refresh)
  useEffect(() => {
    getDriverOnboardingContext().then((ctx) => {
      if (ctx?.phone && ctx?.onboardingToken) {
        router.replace({
          pathname: "/(auth)/driver/onboarding",
          params: { phone: ctx.phone, onboardingToken: ctx.onboardingToken },
        });
      }
    });
  }, [router]);

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ backgroundColor: "#fff" }}
    >
      <StatusBar style="dark" />
      <View className="flex-1">
        {/* Top Section - Map Area (2/3 of screen) */}
        <View
          style={{
            flex: 3,
            backgroundColor: "#ffffff", // Light pastel green background
            // paddingTop: 20,
            // paddingHorizontal: 20,
          }}
        >
          {/* Logo */}
          {/* <View className="mb-4">
            <Image
              source={require('@/assets/logo.svg')}
              style={{ width: 100, height: 50 }}
              contentFit="contain"
            />
          </View> */}

          {/* Map Image */}
          <View className="flex-1 items-center justify-center">
            <Image
              source={require("@/assets/images/car.png")}
              style={{
                width: "100%",
                height: "100%",
              }}
              contentFit="cover"
            />
          </View>
        </View>

        {/* Bottom Section - Content Area (1/3 of screen) */}
        <View
          style={{
            flex: 1,
            backgroundColor: "white",
            paddingHorizontal: 24,
            gap: 16,
            paddingTop: 24,
            paddingBottom: 20,
            justifyContent: "center",
          }}
        >
          {/* Text Content */}
          <View>
            <Text
              style={{ fontFamily: "Figtree_600SemiBold" }}
              className="text-2xl text-black mb-2 text-left"
            >
              Explore new ways to travel with Ukdrive
            </Text>
          </View>

          {/* Role Selection Buttons */}
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              onPress={() => router.push("/(auth)/passenger/send-otp")}
              activeOpacity={0.8}
              style={{
                backgroundColor: BRAND_ORANGE,
                borderRadius: 8,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
              }}
            >
              <Text
                style={{ fontFamily: "Figtree_600SemiBold" }}
                className="text-white text-base"
              >
                Continue as Passenger
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/driver/send-otp")}
              activeOpacity={0.8}
              style={{
                backgroundColor: "#fff",
                borderRadius: 8,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                borderWidth: 1.5,
                borderColor: BRAND_PURPLE,
              }}
            >
              <Text
                style={{ fontFamily: "Figtree_600SemiBold", color: BRAND_PURPLE }}
                className="text-base"
              >
                Continue as Driver
              </Text>
            </TouchableOpacity>

            {/* Terms Text */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{ fontFamily: "Figtree_400Regular" }}
                className="text-xs text-gray-500 text-center"
              >
                By continuing, you agree that you have read and accept our{" "}
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push("/terms-conditions")}
              >
                <Text
                  style={{ textDecorationLine: "underline", color: "#6B7280" }}
                  className="text-xs"
                >
                  Terms &amp; Conditions
                </Text>
              </TouchableOpacity>
              <Text
                style={{ fontFamily: "Figtree_400Regular" }}
                className="text-xs text-gray-500 text-center"
              >
                {" "}and{" "}
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push("/privacy-policy")}
              >
                <Text
                  style={{ textDecorationLine: "underline", color: "#6B7280" }}
                  className="text-xs"
                >
                  Privacy Policy
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}


import React from "react";
import {
  StyleProp,
  StyleSheet,
  TextInput as RNTextInput,
  TextInputProps,
  TextStyle,
} from "react-native";
import { useLanguage } from "@/context/language-context";

function getHindiInputFontFamily(style?: StyleProp<TextStyle>): string {
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontFamily = flattened?.fontFamily ?? "";
  const fontWeight = flattened?.fontWeight;

  if (fontFamily.includes("Figtree_700") || fontWeight === "700" || fontWeight === "800" || fontWeight === "900") {
    return "NotoSansDevanagari_700Bold";
  }
  if (fontFamily.includes("Figtree_600") || fontFamily.includes("SemiBold") || fontWeight === "600") {
    return "NotoSansDevanagari_600SemiBold";
  }
  if (fontFamily.includes("Figtree_500") || fontFamily.includes("Medium") || fontWeight === "500") {
    return "NotoSansDevanagari_500Medium";
  }
  if (fontFamily.includes("Figtree_300") || fontFamily.includes("Light") || fontWeight === "300") {
    return "NotoSansDevanagari_300Light";
  }
  return "NotoSansDevanagari_400Regular";
}

export const LocalizedTextInput = React.forwardRef<
  React.ComponentRef<typeof RNTextInput>,
  TextInputProps
>(({ placeholder, accessibilityLabel, style, ...rest }, ref) => {
  const { language, t } = useLanguage();

  const translatedPlaceholder =
    typeof placeholder === "string" ? t(placeholder) : placeholder;
  const translatedAccessibilityLabel =
    typeof accessibilityLabel === "string"
      ? t(accessibilityLabel)
      : accessibilityLabel;

  return (
    <RNTextInput
      ref={ref}
      {...rest}
      placeholder={translatedPlaceholder}
      accessibilityLabel={translatedAccessibilityLabel}
      style={[
        style,
        language === "hi"
          ? {
              fontFamily: getHindiInputFontFamily(style),
            }
          : null,
      ]}
    />
  );
});

LocalizedTextInput.displayName = "LocalizedTextInput";


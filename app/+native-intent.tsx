/**
 * Handles external deep links that do not directly match app routes.
 * Prevents unmatched-route screens for generic OneSignal launch URLs like `ukdrive:///`.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const raw = (path || "").trim();

    if (!raw || raw === "/" || raw === "ukdrive:///" || raw === "ukdrive://") {
      return "/(tabs)";
    }

    const normalized = raw.startsWith("ukdrive://")
      ? (() => {
          const url = new URL(raw);
          if (url.pathname && url.pathname !== "/") return url.pathname;
          // Handle host-style deep links like ukdrive://ride-incoming
          if (url.host) return `/${url.host}`;
          return url.pathname;
        })()
      : raw;

    const cleaned = normalized.replace(/\/$/, "");

    const rideMatch = cleaned.match(/^\/?(?:\(tabs\)\/)?ride\/([A-Za-z0-9-]+)$/);
    if (rideMatch?.[1]) {
      return `/ride-details?id=${rideMatch[1]}`;
    }

    const porterMatch = cleaned.match(/^\/?(?:\(tabs\)\/)?porter\/([A-Za-z0-9-]+)$/);
    if (porterMatch?.[1]) {
      return `/porter-details?id=${porterMatch[1]}`;
    }

    const carpoolMatch = cleaned.match(/^\/?(?:\(tabs\)\/)?carpool\/([A-Za-z0-9-]+)$/);
    if (carpoolMatch?.[1]) {
      return `/pool-details?id=${carpoolMatch[1]}`;
    }

    return normalized || "/(tabs)";
  } catch {
    return "/(tabs)";
  }
}

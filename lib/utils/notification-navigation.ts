import type { Href } from "expo-router";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function resolveNotificationHref(input: {
  type?: string | null;
  data?: Record<string, unknown> | null;
}): Href {
  const type = asString(input.type) ?? "";
  const data = input.data ?? {};

  const rideId = asString(data.rideId);
  const porterServiceId = asString(data.porterServiceId);
  const carPoolId = asString(data.carPoolId);
  const action = asString(data.action);
  const dataType = asString(data.type);
  const effectiveType = dataType ?? type;

  if (rideId) {
    if (action === "ride_payment") {
      return { pathname: "/ride-payment", params: { rideId } };
    }

    // Incoming ride request: open full-screen RideIncomingScreen (driver)
    if (
      asString(data.notificationType) === "incoming_ride" ||
      effectiveType === "ride_request"
    ) {
      const params: Record<string, string> = { rideId };
      const pickup = asString(data.pickupLocation);
      const dest = asString(data.destination);
      const fareVal = asString(data.estimatedFare) ?? asString(data.fare);
      const distVal = asString(data.estimatedDistance);
      if (pickup) params.pickupLocation = pickup;
      if (dest) params.destination = dest;
      if (fareVal) params.fare = fareVal;
      if (distVal) params.distance = distVal;
      return { pathname: "/ride-incoming", params };
    }

    if (
      effectiveType === "ride_arriving" ||
      effectiveType === "ride_started" ||
      action === "ride_expiring" ||
      action === "driver_action_needed"
    ) {
      return "/(tabs)/active-ride";
    }

    return { pathname: "/ride-details", params: { id: rideId, from: "notifications" } };
  }

  if (porterServiceId) {
    if (
      asString(data.notificationType) === "incoming_porter" ||
      effectiveType === "porter_request"
    ) {
      const params: Record<string, string> = { porterServiceId };
      const pickup = asString(data.pickupLocation);
      const delivery = asString(data.deliveryLocation);
      const fareVal = asString(data.estimatedFare) ?? asString(data.fare);
      if (pickup) params.pickupLocation = pickup;
      if (delivery) params.deliveryLocation = delivery;
      if (fareVal) params.fare = fareVal;
      return { pathname: "/porter-incoming", params };
    }

    if (effectiveType === "porter_delivered") {
      return { pathname: "/porter-payment", params: { porterServiceId } };
    }

    if (effectiveType === "porter_delivered_driver") {
      return {
        pathname: "/porter-payment-status",
        params: { porterServiceId },
      };
    }

    if (
      effectiveType === "porter_accepted" ||
      effectiveType === "porter_picked_up"
    ) {
      return "/(tabs)/active-porter";
    }

    return { pathname: "/porter-details", params: { id: porterServiceId } };
  }

  if (carPoolId) {
    if (
      effectiveType === "carpool_started" ||
      effectiveType === "carpool_confirmed" ||
      effectiveType === "carpool_join_approved" ||
      effectiveType === "carpool_join_requested" ||
      effectiveType === "carpool_seat_requested"
    ) {
      return "/(tabs)/active-car-pool";
    }

    return { pathname: "/pool-details", params: { id: carPoolId } };
  }

  return "/(tabs)/notifications";
}

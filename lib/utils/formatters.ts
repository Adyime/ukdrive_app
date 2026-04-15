type DateInput = string | Date | null | undefined;

function asDate(input: DateInput): Date | null {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCurrencyINR(
  value: number | null | undefined,
  options?: Omit<Intl.NumberFormatOptions, "style" | "currency">
): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
    ...options,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatDateTimeIN(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  fallback = "-"
): string {
  const date = asDate(value);
  if (!date) return fallback;
  return date.toLocaleString("en-IN", options);
}

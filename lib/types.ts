export type PinStatus = "active" | "stale" | "helped" | "closed" | "suspicious";

/**
 * Client-side merged view of a pin: the coarse `pins_public` row overlaid
 * with the full `pins` row when RLS actually returned one for the current
 * viewer (their own pin, or any pin if they're a rescue unit). `isFull`
 * tells components whether phone/contactName/note/requesterId are trustworthy
 * (present) or simply weren't returned by the query at all.
 */
export type MergedPin = {
  id: string;
  status: PinStatus;
  lat: number;
  lng: number;
  headcount: number;
  needsFood: boolean;
  needsMedicine: boolean;
  needsMedicalAid: boolean;
  createdAt: string;
  isFull: boolean;
  phone?: string;
  contactName?: string | null;
  note?: string | null;
  requesterId?: string;
  lastConfirmedAt?: string;
};

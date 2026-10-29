/**
 * Time and Date Utilities for EventSync Scheduling Engine.
 * All times are venue-local naive dates and times.
 * Operating hours: 08:00 to 22:00.
 * Reserved window = [event_start - 30 min, event_end + 30 min].
 * Both the event and its setup/cleanup buffers must strictly fall within operating hours.
 */

export const OPERATING_OPEN_MINUTES = 8 * 60;   // 08:00 = 480 mins
export const OPERATING_CLOSE_MINUTES = 22 * 60; // 22:00 = 1320 mins
export const BUFFER_MINUTES = 30;

export function timeToMinutes(timeStr: string): number {
  const str = String(timeStr || '').trim();
  const isPM = /pm/i.test(str);
  const isAM = /am/i.test(str);
  const clean = str.replace(/[^\d:]/g, '');
  const parts = clean.split(':');
  if (parts.length < 2) {
    throw new Error(`Invalid time format: ${timeStr}. Expected HH:MM or HH:MM AM/PM`);
  }
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10) || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function normalizeTime(timeStr: string): string {
  return minutesToTime(timeToMinutes(timeStr));
}

export function normalizeDate(dateStr: string): string {
  const str = String(dateStr || '').trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [d, m, y] = str.split('-');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m}-${d}`;
  }
  return str;
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, totalMinutes));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export interface ReservedWindow {
  eventDate: string;        // YYYY-MM-DD
  startTime: string;        // HH:MM
  endTime: string;          // HH:MM
  reservedStart: string;    // HH:MM
  reservedEnd: string;      // HH:MM
  startMinutes: number;     // minutes from midnight
  endMinutes: number;
  reservedStartMinutes: number;
  reservedEndMinutes: number;
}

export function computeReservedInterval(
  eventDate: string,
  startTime: string,
  endTime: string
): ReservedWindow {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (endMinutes <= startMinutes) {
    throw new Error('Event end time must be after event start time.');
  }

  const reservedStartMinutes = startMinutes - BUFFER_MINUTES;
  const reservedEndMinutes = endMinutes + BUFFER_MINUTES;

  return {
    eventDate: eventDate.trim(),
    startTime: startTime.trim(),
    endTime: endTime.trim(),
    reservedStart: minutesToTime(reservedStartMinutes),
    reservedEnd: minutesToTime(reservedEndMinutes),
    startMinutes,
    endMinutes,
    reservedStartMinutes,
    reservedEndMinutes,
  };
}

export function isWithinOperatingHours(window: ReservedWindow): {
  valid: boolean;
  message?: string;
} {
  if (window.reservedStartMinutes < OPERATING_OPEN_MINUTES || window.reservedEndMinutes > OPERATING_CLOSE_MINUTES) {
    return {
      valid: false,
      message: `Reserved window ${window.reservedStart}-${window.reservedEnd} (including mandatory 30-min setup & cleanup buffers) is outside operating hours (08:00–22:00). Earliest allowed event start is 08:30; latest allowed event end is 21:30.`,
    };
  }
  return { valid: true };
}

/**
 * Checks if two half-open intervals [startA, endA) and [startB, endB) overlap.
 * Intervals that only touch at boundaries do not overlap.
 */
export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && endA > startB;
}

export function clamp(val: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, val));
}

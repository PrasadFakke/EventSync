/**
 * Alternative Suggestions Generator for EventSync.
 * If a request fails, this generator tests candidate time-shifts and alternative venues
 * to offer verified feasible alternatives to the user.
 */

import { allocateEvent, VenueEntity, BookingEntity, BookingRequestInput } from './allocator.js';
import { timeToMinutes, minutesToTime, OPERATING_OPEN_MINUTES, OPERATING_CLOSE_MINUTES } from './timeUtils.js';

export interface AlternativeSuggestion {
  type: 'time_shift' | 'alternate_venue';
  title: string;
  venue_name: string;
  hall_name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  description: string;
}

export function generateAlternativeSuggestions(
  request: BookingRequestInput,
  venues: VenueEntity[],
  confirmedBookings: BookingEntity[],
  limit: number = 3
): AlternativeSuggestion[] {
  const suggestions: AlternativeSuggestion[] = [];

  const startMin = timeToMinutes(request.start_time);
  const endMin = timeToMinutes(request.end_time);
  const duration = endMin - startMin;

  // 1. Try time shifts: +30m, -30m, +60m, -60m, +120m, -120m
  const shifts = [30, -30, 60, -60, 120, -120, 180, -180];
  for (const shift of shifts) {
    if (suggestions.length >= limit) break;

    const newStartMin = startMin + shift;
    const newEndMin = newStartMin + duration;

    // Must be within operating hours [08:00, 22:00] with 30m buffer -> [08:30, 21:30]
    if (newStartMin - 30 < OPERATING_OPEN_MINUTES || newEndMin + 30 > OPERATING_CLOSE_MINUTES) {
      continue;
    }

    const testReq: BookingRequestInput = {
      ...request,
      start_time: minutesToTime(newStartMin),
      end_time: minutesToTime(newEndMin),
    };

    const res = allocateEvent(testReq, venues, confirmedBookings);
    if (res.status === 'confirmed') {
      suggestions.push({
        type: 'time_shift',
        title: `Shift by ${Math.abs(shift)} mins ${shift > 0 ? 'later' : 'earlier'}`,
        venue_name: res.allocated_venue_name || '',
        hall_name: res.allocated_hall_name || '',
        event_date: request.event_date,
        start_time: testReq.start_time,
        end_time: testReq.end_time,
        description: `Available in Hall ${res.allocated_hall_name} from ${testReq.start_time} to ${testReq.end_time}.`,
      });
    }
  }

  // 2. Try alternate venues at the same time if not already suggested
  for (const v of venues) {
    if (suggestions.length >= limit) break;
    if (v.id === request.preferred_venue_id) continue;

    const testReq: BookingRequestInput = {
      ...request,
      preferred_venue_id: v.id,
    };

    const res = allocateEvent(testReq, [v], confirmedBookings);
    if (res.status === 'confirmed') {
      suggestions.push({
        type: 'alternate_venue',
        title: `Book at ${res.allocated_venue_name}`,
        venue_name: res.allocated_venue_name || '',
        hall_name: res.allocated_hall_name || '',
        event_date: request.event_date,
        start_time: request.start_time,
        end_time: request.end_time,
        description: `Same time slot is fully available at ${res.allocated_venue_name} in Hall ${res.allocated_hall_name}.`,
      });
    }
  }

  return suggestions;
}

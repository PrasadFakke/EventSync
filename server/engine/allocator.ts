/**
 * Core Deterministic Allocation Engine for EventSync.
 * 
 * Rules:
 * 1. 30-min setup & cleanup buffers.
 * 2. Operating hours 08:00–22:00.
 * 3. Search preferred venue first; if infeasible, evaluate other venues in consistent order (A, B, C).
 * 4. Select smallest-capacity hall that satisfies capacity >= attendees.
 * 5. Tie-breaker: (hall.capacity ASC, hall.id ASC).
 * 6. Peak-concurrency sweep line for shared resources (projectors, audio, staff).
 * 7. Returns detailed diagnostic evaluation trace.
 */

import {
  computeReservedInterval,
  isWithinOperatingHours,
  intervalsOverlap,
  timeToMinutes,
  ReservedWindow,
} from './timeUtils.js';
import {
  checkAllVenueResources,
  BookingResourceUsage,
  ResourceCheckResult,
} from './resourceChecker.js';

export interface VenueEntity {
  id: number;
  code: string;
  name: string;
  projectors: number;
  audio_systems: number;
  staff: number;
  halls: HallEntity[];
}

export interface HallEntity {
  id: number;
  venue_id: number;
  name: string;
  capacity: number;
  base_hourly_rate?: number;
}

export interface BookingEntity {
  id: number;
  venue_id: number; // allocated venue id
  hall_id?: number | null; // allocated hall id
  event_date: string;
  start_time: string;
  end_time: string;
  reserved_start?: string;
  reserved_end?: string;
  attendees: number;
  projectors: number;
  audio_systems: number;
  staff: number;
  status: string; // 'confirmed', 'pending', etc.
}

export interface BookingRequestInput {
  title: string;
  event_type?: string;
  event_date: string;
  start_time: string;
  end_time: string;
  attendees: number;
  preferred_venue_id: number;
  projectors: number;
  audio_systems: number;
  staff: number;
  exclude_booking_id?: number;
}

export interface HallTrace {
  hall_id: number;
  hall_name: string;
  capacity: number;
  passed: boolean;
  code?: string;
  message: string;
}

export interface VenueTrace {
  venue_id: number;
  venue_code: string;
  venue_name: string;
  is_preferred: boolean;
  inventory_feasible: boolean;
  resource_checks?: {
    projectors: ResourceCheckResult;
    audio_systems: ResourceCheckResult;
    staff: ResourceCheckResult;
  };
  hall_evaluations: HallTrace[];
}

export interface AllocationResult {
  status: 'confirmed' | 'rejected';
  allocated_venue_id?: number;
  allocated_venue_code?: string;
  allocated_venue_name?: string;
  allocated_hall_id?: number;
  allocated_hall_name?: string;
  reserved_window?: ReservedWindow;
  reason?: string;
  details: string[];
  trace: VenueTrace[];
  peak_usage?: {
    projectors: { peak: number; capacity: number };
    audio_systems: { peak: number; capacity: number };
    staff: { peak: number; capacity: number };
  };
}

export function sortHalls(halls: HallEntity[]): HallEntity[] {
  return [...halls].sort((a, b) => {
    if (a.capacity !== b.capacity) {
      return a.capacity - b.capacity; // Smallest capacity first
    }
    return a.id - b.id; // Consistent tie-breaker
  });
}

export function orderVenues(venues: VenueEntity[], preferredVenueId: number): VenueEntity[] {
  const preferred = venues.filter((v) => v.id === preferredVenueId);
  const others = venues
    .filter((v) => v.id !== preferredVenueId)
    .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
  return [...preferred, ...others];
}

export function allocateEvent(
  request: BookingRequestInput,
  allVenues: VenueEntity[],
  allConfirmedBookings: BookingEntity[]
): AllocationResult {
  const traces: VenueTrace[] = [];
  const rejectionDetails: string[] = [];

  // 1. Compute and validate reserved interval
  let reservedWindow: ReservedWindow;
  try {
    reservedWindow = computeReservedInterval(
      request.event_date,
      request.start_time,
      request.end_time
    );
  } catch (err: any) {
    return {
      status: 'rejected',
      reason: err.message || 'Invalid time specification.',
      details: [err.message || 'Invalid time.'],
      trace: [],
    };
  }

  // Check operating hours (08:00–22:00)
  const hoursCheck = isWithinOperatingHours(reservedWindow);
  if (!hoursCheck.valid) {
    const msg = hoursCheck.message!;
    return {
      status: 'rejected',
      reserved_window: reservedWindow,
      reason: 'Requested event time and 30-min setup/cleanup buffer fall outside operating hours (08:00–22:00).',
      details: [msg],
      trace: [],
    };
  }

  // 2. Check maximum hall capacity anywhere
  let maxGlobalCapacity = 0;
  for (const v of allVenues) {
    for (const h of v.halls) {
      if (h.capacity > maxGlobalCapacity) {
        maxGlobalCapacity = h.capacity;
      }
    }
  }

  if (request.attendees > maxGlobalCapacity) {
    const msg = `Expected attendees (${request.attendees}) exceeds the maximum seating capacity of any hall in the network (${maxGlobalCapacity} seats).`;
    return {
      status: 'rejected',
      reserved_window: reservedWindow,
      reason: msg,
      details: [msg],
      trace: [],
    };
  }

  // 3. Order venues: Preferred venue FIRST, then remaining venues alphabetically by code
  const orderedVenues = orderVenues(allVenues, request.preferred_venue_id);

  for (const venue of orderedVenues) {
    const isPreferred = venue.id === request.preferred_venue_id;
    const venueTrace: VenueTrace = {
      venue_id: venue.id,
      venue_code: venue.code,
      venue_name: venue.name,
      is_preferred: isPreferred,
      inventory_feasible: true,
      hall_evaluations: [],
    };

    // A. Check total venue inventory limit
    let totalInventoryExceeded = false;
    if (request.projectors > venue.projectors) {
      totalInventoryExceeded = true;
      const msg = `Requested ${request.projectors} projectors exceeds Venue ${venue.code} total pool (${venue.projectors}).`;
      rejectionDetails.push(msg);
    }
    if (request.audio_systems > venue.audio_systems) {
      totalInventoryExceeded = true;
      const msg = `Requested ${request.audio_systems} audio systems exceeds Venue ${venue.code} total pool (${venue.audio_systems}).`;
      rejectionDetails.push(msg);
    }
    if (request.staff > venue.staff) {
      totalInventoryExceeded = true;
      const msg = `Requested ${request.staff} support staff exceeds Venue ${venue.code} total pool (${venue.staff}).`;
      rejectionDetails.push(msg);
    }

    if (totalInventoryExceeded) {
      venueTrace.inventory_feasible = false;
      traces.push(venueTrace);
      continue;
    }

    // Filter confirmed bookings at this venue for this date
    const venueConfirmed = allConfirmedBookings
      .filter((b) => b.venue_id === venue.id && b.event_date === request.event_date && b.status === 'confirmed')
      .map((b) => {
        let bStartMin: number;
        let bEndMin: number;
        if (b.reserved_start && b.reserved_end) {
          bStartMin = timeToMinutes(b.reserved_start);
          bEndMin = timeToMinutes(b.reserved_end);
        } else {
          bStartMin = timeToMinutes(b.start_time) - 30;
          bEndMin = timeToMinutes(b.end_time) + 30;
        }
        return {
          id: b.id,
          reservedStartMinutes: bStartMin,
          reservedEndMinutes: bEndMin,
          projectors: b.projectors,
          audio_systems: b.audio_systems,
          staff: b.staff,
          status: b.status,
        } as BookingResourceUsage;
      });

    // B. Check shared resource peak concurrency across this venue
    const resourceEval = checkAllVenueResources(
      {
        projectors: request.projectors,
        audio_systems: request.audio_systems,
        staff: request.staff,
      },
      {
        projectors: venue.projectors,
        audio_systems: venue.audio_systems,
        staff: venue.staff,
      },
      reservedWindow.reservedStartMinutes,
      reservedWindow.reservedEndMinutes,
      venueConfirmed,
      request.exclude_booking_id
    );

    venueTrace.resource_checks = resourceEval.results;
    const resourceFailed = !resourceEval.feasible;

    // C. Evaluate halls sorted by smallest capacity first: (capacity ASC, id ASC)
    const sortedHalls = sortHalls(venue.halls);

    for (const hall of sortedHalls) {
      // 1. Capacity check
      if (hall.capacity < request.attendees) {
        const msg = `Hall ${hall.name} seats ${hall.capacity}, but ${request.attendees} attendees requested.`;
        venueTrace.hall_evaluations.push({
          hall_id: hall.id,
          hall_name: hall.name,
          capacity: hall.capacity,
          passed: false,
          code: 'CAPACITY_EXCEEDED',
          message: msg,
        });
        rejectionDetails.push(`Venue ${venue.code} - ${msg}`);
        continue;
      }

      // 2. Hall occupancy check
      let conflictBooking: BookingEntity | undefined;
      for (const b of allConfirmedBookings) {
        if (b.status !== 'confirmed') continue;
        if (request.exclude_booking_id && b.id === request.exclude_booking_id) continue;
        if (b.event_date !== request.event_date) continue;
        if (b.venue_id === venue.id && b.hall_id === hall.id) {
          const bStartMin = b.reserved_start ? timeToMinutes(b.reserved_start) : timeToMinutes(b.start_time) - 30;
          const bEndMin = b.reserved_end ? timeToMinutes(b.reserved_end) : timeToMinutes(b.end_time) + 30;
          if (intervalsOverlap(reservedWindow.reservedStartMinutes, reservedWindow.reservedEndMinutes, bStartMin, bEndMin)) {
            conflictBooking = b;
            break;
          }
        }
      }

      if (conflictBooking) {
        const msg = `Hall ${hall.name} is occupied (${conflictBooking.reserved_start || conflictBooking.start_time}–${conflictBooking.reserved_end || conflictBooking.end_time}) by booking #${conflictBooking.id}.`;
        venueTrace.hall_evaluations.push({
          hall_id: hall.id,
          hall_name: hall.name,
          capacity: hall.capacity,
          passed: false,
          code: 'HALL_OCCUPIED',
          message: msg,
        });
        rejectionDetails.push(`Venue ${venue.code} - ${msg}`);
        continue;
      }

      // 3. Shared resource check
      if (resourceFailed) {
        const msg = `Hall ${hall.name} has capacity and is free, but shared resource inventory at Venue ${venue.code} is exhausted: ${resourceEval.failureDetails.join(' ')}`;
        venueTrace.hall_evaluations.push({
          hall_id: hall.id,
          hall_name: hall.name,
          capacity: hall.capacity,
          passed: false,
          code: 'RESOURCE_SHORTAGE',
          message: msg,
        });
        rejectionDetails.push(msg);
        continue;
      }

      // Both hall and resources are available! ALLOCATE THIS HALL!
      venueTrace.hall_evaluations.push({
        hall_id: hall.id,
        hall_name: hall.name,
        capacity: hall.capacity,
        passed: true,
        message: `Hall ${hall.name} (capacity ${hall.capacity}) allocated successfully with all requested shared resources.`,
      });
      traces.push(venueTrace);

      return {
        status: 'confirmed',
        allocated_venue_id: venue.id,
        allocated_venue_code: venue.code,
        allocated_venue_name: venue.name,
        allocated_hall_id: hall.id,
        allocated_hall_name: hall.name,
        reserved_window: reservedWindow,
        trace: traces,
        details: [`Successfully confirmed in Hall ${hall.name} at ${venue.name}.`],
        peak_usage: {
          projectors: {
            peak: resourceEval.results.projectors.peakDemand,
            capacity: venue.projectors,
          },
          audio_systems: {
            peak: resourceEval.results.audio_systems.peakDemand,
            capacity: venue.audio_systems,
          },
          staff: {
            peak: resourceEval.results.staff.peakDemand,
            capacity: venue.staff,
          },
        },
      };
    }

    traces.push(venueTrace);
  }

  // If no hall could be allocated at any venue
  const summaryReason = orderedVenues.length === 1
    ? `No feasible hall or shared resources available at ${orderedVenues[0].name} for the requested time.`
    : `No feasible hall and shared resources found across preferred venue (${orderedVenues[0]?.name}) or alternate venues.`;

  return {
    status: 'rejected',
    reserved_window: reservedWindow,
    reason: summaryReason,
    details: rejectionDetails.length > 0 ? rejectionDetails : [summaryReason],
    trace: traces,
  };
}

/**
 * Peak-concurrency sweep line resource checker.
 * Evaluates shared resource availability (projectors, audio systems, support staff)
 * across concurrent bookings at a specific venue during the reserved window.
 */

import { intervalsOverlap, clamp, minutesToTime } from './timeUtils.js';

export interface BookingResourceUsage {
  id: number;
  reservedStartMinutes: number;
  reservedEndMinutes: number;
  projectors: number;
  audio_systems: number;
  staff: number;
  status: string;
}

export interface ResourceCheckResult {
  feasible: boolean;
  peakDemand: number;
  capacity: number;
  worstSegment?: { start: string; end: string };
  code?: string;
  message?: string;
}

export function checkResourceConcurrency(
  resourceType: 'projectors' | 'audio_systems' | 'staff',
  requestedQty: number,
  venueTotalCapacity: number,
  reqStartMin: number,
  reqEndMin: number,
  confirmedBookings: BookingResourceUsage[],
  excludeBookingId?: number
): ResourceCheckResult {
  if (requestedQty < 0) {
    throw new Error(`Requested ${resourceType} quantity cannot be negative`);
  }

  // 1. Filter bookings: must be confirmed, must overlap [reqStartMin, reqEndMin), exclude self
  const overlapping: { start: number; end: number; qty: number }[] = [];
  for (const b of confirmedBookings) {
    if (b.status !== 'confirmed') continue;
    if (excludeBookingId !== undefined && b.id === excludeBookingId) continue;

    if (intervalsOverlap(reqStartMin, reqEndMin, b.reservedStartMinutes, b.reservedEndMinutes)) {
      const qty = b[resourceType] || 0;
      if (qty > 0) {
        overlapping.push({
          start: b.reservedStartMinutes,
          end: b.reservedEndMinutes,
          qty,
        });
      }
    }
  }

  // 2. Build sorted unique boundary points within [reqStartMin, reqEndMin]
  const boundarySet = new Set<number>([reqStartMin, reqEndMin]);
  for (const b of overlapping) {
    boundarySet.add(clamp(b.start, reqStartMin, reqEndMin));
    boundarySet.add(clamp(b.end, reqStartMin, reqEndMin));
  }
  const sortedPts = Array.from(boundarySet).sort((a, b) => a - b);

  let peakDemand = requestedQty;
  let isFeasible = true;
  let worstSegment: { start: string; end: string } | undefined;
  let shortageCode: string | undefined;
  let shortageMsg: string | undefined;

  const displayNames = {
    projectors: 'Projectors',
    audio_systems: 'Audio systems',
    staff: 'Support staff',
  };

  // 3. For each consecutive interval [t_i, t_{i+1}):
  for (let i = 0; i < sortedPts.length - 1; i++) {
    const t1 = sortedPts[i];
    const t2 = sortedPts[i + 1];
    if (t1 === t2) continue;

    let segmentDemand = requestedQty;
    for (const b of overlapping) {
      if (b.start <= t1 && b.end >= t2) {
        segmentDemand += b.qty;
      }
    }

    if (segmentDemand > peakDemand) {
      peakDemand = segmentDemand;
    }

    if (segmentDemand > venueTotalCapacity && isFeasible) {
      isFeasible = false;
      worstSegment = {
        start: minutesToTime(t1),
        end: minutesToTime(t2),
      };
      shortageCode = `${resourceType.toUpperCase()}_SHORTAGE`;
      shortageMsg = `Peak demand for ${displayNames[resourceType]} (${segmentDemand}) exceeds available venue inventory (${venueTotalCapacity}) during ${worstSegment.start}–${worstSegment.end}.`;
    }
  }

  return {
    feasible: isFeasible,
    peakDemand,
    capacity: venueTotalCapacity,
    worstSegment,
    code: shortageCode,
    message: shortageMsg,
  };
}

export function checkAllVenueResources(
  requested: { projectors: number; audio_systems: number; staff: number },
  venueCapacity: { projectors: number; audio_systems: number; staff: number },
  reqStartMin: number,
  reqEndMin: number,
  confirmedBookings: BookingResourceUsage[],
  excludeBookingId?: number
): {
  feasible: boolean;
  results: {
    projectors: ResourceCheckResult;
    audio_systems: ResourceCheckResult;
    staff: ResourceCheckResult;
  };
  failureDetails: string[];
} {
  const projRes = checkResourceConcurrency(
    'projectors',
    requested.projectors,
    venueCapacity.projectors,
    reqStartMin,
    reqEndMin,
    confirmedBookings,
    excludeBookingId
  );

  const audioRes = checkResourceConcurrency(
    'audio_systems',
    requested.audio_systems,
    venueCapacity.audio_systems,
    reqStartMin,
    reqEndMin,
    confirmedBookings,
    excludeBookingId
  );

  const staffRes = checkResourceConcurrency(
    'staff',
    requested.staff,
    venueCapacity.staff,
    reqStartMin,
    reqEndMin,
    confirmedBookings,
    excludeBookingId
  );

  const failureDetails: string[] = [];
  if (!projRes.feasible && projRes.message) failureDetails.push(projRes.message);
  if (!audioRes.feasible && audioRes.message) failureDetails.push(audioRes.message);
  if (!staffRes.feasible && staffRes.message) failureDetails.push(staffRes.message);

  return {
    feasible: projRes.feasible && audioRes.feasible && staffRes.feasible,
    results: {
      projectors: projRes,
      audio_systems: audioRes,
      staff: staffRes,
    },
    failureDetails,
  };
}

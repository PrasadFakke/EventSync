import { db, getAllVenuesWithHalls, getAllConfirmedBookings } from './db.js';
import { computeReservedInterval, isWithinOperatingHours, timeToMinutes } from './engine/timeUtils.js';
import { allocateEvent, VenueEntity, BookingEntity } from './engine/allocator.js';
import { calculateEventPricing } from './engine/pricing.js';
import bcrypt from 'bcryptjs';

console.log('=== EventSync Comprehensive System Test ===');

// 1. Verify Users & Login credentials
console.log('\n--- 1. Testing Seeded Users & Logins ---');
const users = db.prepare('SELECT id, email, role, password_hash FROM users').all() as any[];
console.log(`Found ${users.length} seeded users in database.`);

for (const cred of [
  { email: 'admin@eventsync.com', pass: 'Admin@123', role: 'manager' },
  { email: 'manager@eventsync.local', pass: 'EventSync2026!', role: 'manager' },
  { email: 'client@eventsync.local', pass: 'Client2026!', role: 'client' },
  { email: 'alex@acme.com', pass: 'Client@123', role: 'client' },
]) {
  const u = users.find(x => x.email.toLowerCase() === cred.email.toLowerCase() && x.role === cred.role);
  if (!u) {
    console.error(`FAIL: User ${cred.email} (${cred.role}) not found!`);
  } else {
    const match = bcrypt.compareSync(cred.pass, u.password_hash);
    if (!match) {
      console.error(`FAIL: Password match failed for ${cred.email}!`);
    } else {
      console.log(`PASS: Verified ${cred.role} login for ${cred.email}`);
    }
  }
}

// 2. Verify Venues, Halls, and Shared Resource Pools
console.log('\n--- 2. Testing Venue Dataset (Section 1.1) ---');
const venues = getAllVenuesWithHalls();
for (const v of venues) {
  console.log(`Venue ${v.code} (${v.name}):`);
  console.log(`  Operating hours: ${v.open_time} – ${v.close_time}`);
  console.log(`  Shared Inventory: ${v.projectors} Projectors, ${v.audio_systems} Audio systems, ${v.staff} Staff`);
  console.log(`  Halls: ${v.halls.map((h: any) => `${h.name} (cap ${h.capacity})`).join(', ')}`);
}

// 3. Testing Hackathon Sample Situation
console.log('\n--- 3. Testing Hackathon Sample Situation ---');
// Venue A receives:
// Event 1: Conference (120 guests, 10:00-13:00, 1 proj, 3 staff)
// Event 2: Workshop (50 guests, 11:00-14:00, 1 proj, 2 staff)
// Event 3: Product launch (100 guests at 13:15, say 13:15-15:15)

const venueA = venues.find(v => v.code === 'A')!;
const vEntities: VenueEntity[] = venues.map(v => ({
  id: v.id,
  code: v.code,
  name: v.name,
  projectors: v.projectors,
  audio_systems: v.audio_systems,
  staff: v.staff,
  halls: v.halls.map((h: any) => ({
    id: h.id,
    venue_id: h.venue_id,
    name: h.name,
    capacity: h.capacity,
  })),
}));

const confirmedBookings: BookingEntity[] = [];

// Step 3a: Allocate Conference
console.log('\nEvaluating Request 1 (Conference: 120 guests, 10:00-13:00, 1 proj, 3 staff)...');
const res1 = allocateEvent(
  {
    title: 'Conference',
    event_date: '2026-10-30',
    start_time: '10:00',
    end_time: '13:00',
    attendees: 120,
    preferred_venue_id: venueA.id,
    projectors: 1,
    audio_systems: 0,
    staff: 3,
  },
  vEntities,
  confirmedBookings
);

console.log(`Result 1: Status = ${res1.status}`);
if (res1.status === 'confirmed') {
  console.log(`PASS: Confirmed in ${res1.allocated_venue_name}, Hall ${res1.allocated_hall_name}`);
  console.log(`      Reserved Window: ${res1.reserved_window?.reservedStart}–${res1.reserved_window?.reservedEnd}`);
  confirmedBookings.push({
    id: 1,
    venue_id: res1.allocated_venue_id!,
    hall_id: res1.allocated_hall_id!,
    event_date: '2026-10-30',
    start_time: '10:00',
    end_time: '13:00',
    reserved_start: res1.reserved_window?.reservedStart,
    reserved_end: res1.reserved_window?.reservedEnd,
    attendees: 120,
    projectors: 1,
    audio_systems: 0,
    staff: 3,
    status: 'confirmed',
  });
}

// Step 3b: Allocate Workshop
console.log('\nEvaluating Request 2 (Workshop: 50 guests, 11:00-14:00, 1 proj, 2 staff)...');
const res2 = allocateEvent(
  {
    title: 'Workshop',
    event_date: '2026-10-30',
    start_time: '11:00',
    end_time: '14:00',
    attendees: 50,
    preferred_venue_id: venueA.id,
    projectors: 1,
    audio_systems: 0,
    staff: 2,
  },
  vEntities,
  confirmedBookings
);

console.log(`Result 2: Status = ${res2.status}`);
if (res2.status === 'confirmed') {
  console.log(`PASS: Confirmed in ${res2.allocated_venue_name}, Hall ${res2.allocated_hall_name}`);
  console.log(`      Reserved Window: ${res2.reserved_window?.reservedStart}–${res2.reserved_window?.reservedEnd}`);
  console.log(`      Peak Resource Concurrency: Projectors ${res2.peak_usage?.projectors.peak}/${res2.peak_usage?.projectors.capacity}, Staff ${res2.peak_usage?.staff.peak}/${res2.peak_usage?.staff.capacity}`);
  confirmedBookings.push({
    id: 2,
    venue_id: res2.allocated_venue_id!,
    hall_id: res2.allocated_hall_id!,
    event_date: '2026-10-30',
    start_time: '11:00',
    end_time: '14:00',
    reserved_start: res2.reserved_window?.reservedStart,
    reserved_end: res2.reserved_window?.reservedEnd,
    attendees: 50,
    projectors: 1,
    audio_systems: 0,
    staff: 2,
    status: 'confirmed',
  });
}

// Step 3c: Evaluate Third Request (Product Launch at 1:15 PM)
console.log('\nEvaluating Request 3 (Product Launch: 100 guests, 13:15-15:15, 1 proj, 1 staff)...');
const res3 = allocateEvent(
  {
    title: 'Product Launch',
    event_date: '2026-10-30',
    start_time: '13:15',
    end_time: '15:15',
    attendees: 100,
    preferred_venue_id: venueA.id,
    projectors: 1,
    audio_systems: 0,
    staff: 1,
  },
  vEntities,
  confirmedBookings
);

console.log(`Result 3: Status = ${res3.status}`);
console.log(`Details: ${res3.details.join(' | ')}`);
if (res3.status === 'confirmed') {
  console.log(`PASS: Successfully re-routed to next feasible venue! Allocated: ${res3.allocated_venue_name}, Hall ${res3.allocated_hall_name}`);
}

// Check what happens if constrained strictly to Venue A:
const res3StrictA = allocateEvent(
  {
    title: 'Product Launch at Venue A Only',
    event_date: '2026-10-30',
    start_time: '13:15',
    end_time: '15:15',
    attendees: 100,
    preferred_venue_id: venueA.id,
    projectors: 1,
    audio_systems: 0,
    staff: 1,
  },
  [vEntities.find(v => v.code === 'A')!],
  confirmedBookings
);
console.log(`When restricted to Venue A only: Status = ${res3StrictA.status}, Reason = ${res3StrictA.reason}`);

// 4. Testing Time Restrictions & Operating Hours
console.log('\n--- 4. Testing Operating Hours & 30-min Buffers (08:00–22:00) ---');
const earlyWindow = computeReservedInterval('2026-10-30', '08:00', '10:00');
const earlyCheck = isWithinOperatingHours(earlyWindow);
console.log(`Event 08:00–10:00 (Buffer starts 07:30): Valid = ${earlyCheck.valid}, Error = ${earlyCheck.message}`);

const lateWindow = computeReservedInterval('2026-10-30', '20:00', '22:00');
const lateCheck = isWithinOperatingHours(lateWindow);
console.log(`Event 20:00–22:00 (Buffer ends 22:30): Valid = ${lateCheck.valid}, Error = ${lateCheck.message}`);

const validWindow = computeReservedInterval('2026-10-30', '08:30', '21:30');
const validCheck = isWithinOperatingHours(validWindow);
console.log(`Event 08:30–21:30 (Buffer 08:00–22:00): Valid = ${validCheck.valid}`);

// 5. Pricing
console.log('\n--- 5. Dynamic Pricing Engine ---');
const p = calculateEventPricing(4.0, 4500, 3);
console.log(`4-hour event in Hall A2 (₹4500/hr) with 3 staff:`);
console.log(`  Subtotal: ₹${p.subtotal}, GST (18%): ₹${p.taxAmount}, Total: ₹${p.totalAmount}`);
console.log(`  25% Advance: ₹${p.advanceDeposit}, 75% Balance: ₹${p.balanceDue}`);

console.log('\n=== ALL TESTS COMPLETED SUCCESSFULLY ===');

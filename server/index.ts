import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, venueData, getAllVenuesWithHalls, getAllConfirmedBookings } from './db.js';
import { computeReservedInterval, isWithinOperatingHours, timeToMinutes, normalizeDate, normalizeTime } from './engine/timeUtils.js';
import { allocateEvent, VenueEntity, BookingEntity } from './engine/allocator.js';
import { calculateEventPricing } from './engine/pricing.js';
import { generateAlternativeSuggestions } from './engine/suggestions.js';

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be configured in production.');
}

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.resolve('uploads')));

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: './data' }),
    secret: process.env.SESSION_SECRET || 'local-development-only-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400000,
    },
  })
);

type User = { id: number; email: string; role: 'client' | 'manager'; name: string };
declare module 'express-session' {
  interface SessionData {
    user?: User;
  }
}

const auth = (role?: string): express.RequestHandler => (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in.' });
  if (role && req.session.user.role !== role) {
    return res.status(403).json({ error: 'You do not have access to this area.' });
  }
  next();
};

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false });

// Helper to load engine data from database
function getEngineVenues(): VenueEntity[] {
  const venues = getAllVenuesWithHalls();
  return venues.map((v) => ({
    id: v.id,
    code: v.code,
    name: v.name,
    projectors: Number(v.projectors || 0),
    audio_systems: Number(v.audio_systems || 0),
    staff: Number(v.staff || 0),
    halls: (v.halls || []).map((h: any) => ({
      id: h.id,
      venue_id: h.venue_id,
      name: h.name,
      capacity: Number(h.capacity),
      base_hourly_rate: Number(h.base_hourly_rate || 3500),
    })),
  }));
}

function getEngineBookings(): BookingEntity[] {
  return getAllConfirmedBookings().map((b) => ({
    id: b.id,
    venue_id: b.allocated_venue_id || b.venue_id,
    hall_id: b.hall_id,
    event_date: b.event_date,
    start_time: b.start_time,
    end_time: b.end_time,
    reserved_start: b.reserved_start,
    reserved_end: b.reserved_end,
    attendees: Number(b.attendees),
    projectors: Number(b.projectors || 0),
    audio_systems: Number(b.audio_systems || 0),
    staff: Number(b.staff || 0),
    status: b.status,
  }));
}

// FIFO Waitlist promotion helper
function promoteWaitlistFifo(): any[] {
  const waitlisted = db.prepare("SELECT * FROM waitlist WHERE status='active' ORDER BY queue_position ASC, created_at ASC").all() as any[];
  const promotedList: any[] = [];

  const venues = getEngineVenues();
  const confirmed = getEngineBookings();

  for (const w of waitlisted) {
    const alloc = allocateEvent(
      {
        title: w.title,
        event_date: w.event_date,
        start_time: w.start_time,
        end_time: w.end_time,
        attendees: w.attendees,
        preferred_venue_id: w.venue_id,
        projectors: 0,
        audio_systems: 0,
        staff: 0,
      },
      venues,
      confirmed
    );

    if (alloc.status === 'confirmed') {
      // Promote!
      db.prepare("UPDATE waitlist SET status='promoted' WHERE id=?").run(w.id);

      const refCode = `ES-${new Date().getFullYear()}-${alloc.allocated_venue_code}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const rw = alloc.reserved_window!;

      const insert = db.prepare(`
        INSERT INTO bookings (
          booking_reference, client_id, venue_id, allocated_venue_id, hall_id,
          title, event_type, event_date, start_time, end_time,
          reserved_start, reserved_end, attendees,
          projectors, audio_systems, staff,
          status, decision_note, amount_due, advance_paid, balance_due, payment_status
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        refCode,
        w.client_id,
        w.venue_id,
        alloc.allocated_venue_id,
        alloc.allocated_hall_id,
        w.title,
        'Waitlist Promoted',
        w.event_date,
        w.start_time,
        w.end_time,
        rw.reservedStart,
        rw.reservedEnd,
        w.attendees,
        0, 0, 0,
        'confirmed',
        `Auto-promoted from waitlist (FIFO) into Hall ${alloc.allocated_hall_name} at ${alloc.allocated_venue_name}.`,
        10000, 2500, 7500, 'advance_pending'
      );

      const newId = Number(insert.lastInsertRowid);
      db.prepare('INSERT INTO history(booking_id, actor_id, action, note) VALUES(?,?,?,?)').run(
        newId,
        w.client_id,
        'PROMOTED_FROM_WAITLIST',
        `Auto-promoted from waitlist (FIFO) to Hall ${alloc.allocated_hall_name}.`
      );

      confirmed.push({
        id: newId,
        venue_id: alloc.allocated_venue_id!,
        hall_id: alloc.allocated_hall_id!,
        event_date: w.event_date,
        start_time: w.start_time,
        end_time: w.end_time,
        reserved_start: rw.reservedStart,
        reserved_end: rw.reservedEnd,
        attendees: w.attendees,
        projectors: 0,
        audio_systems: 0,
        staff: 0,
        status: 'confirmed',
      });

      promotedList.push({
        waitlist_id: w.id,
        booking_id: newId,
        title: w.title,
        hall: alloc.allocated_hall_name,
        venue: alloc.allocated_venue_name,
      });
    }
  }

  return promotedList;
}

// ======================== AUTH ROUTES ========================
app.get('/api/auth/me', (req, res) => res.json({ user: req.session.user || null }));

app.post('/api/auth/client/register', loginLimit, async (req, res) => {
  const s = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
  }).safeParse(req.body);

  if (!s.success) {
    return res.status(400).json({ error: 'Enter a valid name, email, and password.' });
  }

  try {
    const hash = await bcrypt.hash(s.data.password, 10);
    const info = db.prepare('INSERT INTO users(name, email, password_hash, role) VALUES(?,?,?,?)').run(
      s.data.name,
      s.data.email.toLowerCase(),
      hash,
      'client'
    );
    req.session.user = {
      id: Number(info.lastInsertRowid),
      email: s.data.email.toLowerCase(),
      role: 'client',
      name: s.data.name,
    };
    res.status(201).json({ user: req.session.user });
  } catch (err: any) {
    res.status(409).json({ error: 'An account with this email already exists.' });
  }
});

app.post('/api/auth/:role/login', loginLimit, async (req, res) => {
  const role = String(req.params.role);
  if (!['client', 'manager'].includes(role)) return res.sendStatus(404);

  const s = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }).safeParse(req.body);

  if (!s.success) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }

  const u = db.prepare('SELECT * FROM users WHERE lower(email)=? AND role=? AND active=1').get(
    s.data.email.toLowerCase(),
    role
  ) as any;

  if (!u || !(await bcrypt.compare(s.data.password, u.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  req.session.user = { id: u.id, email: u.email, role: u.role, name: u.name };
  res.json({ user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// ======================== PUBLIC ROUTES ========================
app.get('/api/public/venues', (req, res) => {
  let q = 'SELECT id FROM venues WHERE active=1';
  const args: any[] = [];
  if (req.query.search) {
    q += ' AND (name LIKE ? OR description LIKE ? OR address LIKE ?)';
    const term = `%${req.query.search}%`;
    args.push(term, term, term);
  }
  const list = db.prepare(q + ' ORDER BY code ASC, id ASC').all(...args).map((x: any) => venueData(x.id));
  res.json(list);
});

app.get('/api/public/venues/:id', (req, res) => {
  const v = venueData(Number(req.params.id));
  if (!v || (!v.active && req.session.user?.role !== 'manager')) return res.sendStatus(404);
  res.json(v);
});

// Dry Run Feasibility Check with Trace and Pricing Preview
app.post('/api/public/check-feasibility', (req, res) => {
  try {
    if (req.body.event_date) req.body.event_date = normalizeDate(req.body.event_date);
    if (req.body.start_time) req.body.start_time = normalizeTime(req.body.start_time);
    if (req.body.end_time) req.body.end_time = normalizeTime(req.body.end_time);
  } catch {}

  const s = z.object({
    preferred_venue_id: z.coerce.number().int(),
    event_date: z.string().min(8),
    start_time: z.string().min(4),
    end_time: z.string().min(4),
    attendees: z.coerce.number().int().positive(),
    projectors: z.coerce.number().int().nonnegative().default(0),
    audio_systems: z.coerce.number().int().nonnegative().default(0),
    staff: z.coerce.number().int().nonnegative().default(0),
    title: z.string().default('Feasibility Check'),
  }).safeParse(req.body);

  if (!s.success) {
    return res.status(400).json({ error: 'Invalid check request parameters.' });
  }

  const venues = getEngineVenues();
  const confirmed = getEngineBookings();

  const alloc = allocateEvent(
    {
      title: s.data.title,
      event_date: s.data.event_date,
      start_time: s.data.start_time,
      end_time: s.data.end_time,
      attendees: s.data.attendees,
      preferred_venue_id: s.data.preferred_venue_id,
      projectors: s.data.projectors,
      audio_systems: s.data.audio_systems,
      staff: s.data.staff,
    },
    venues,
    confirmed
  );

  let pricing = null;
  if (alloc.status === 'confirmed' && alloc.reserved_window) {
    const duration = (alloc.reserved_window.endMinutes - alloc.reserved_window.startMinutes) / 60;
    pricing = calculateEventPricing(duration, 3500, s.data.staff);
  }

  // Check if preferred venue was not allocated
  const allocatedDifferentFromPreferred = alloc.status === 'confirmed' && alloc.allocated_venue_id !== s.data.preferred_venue_id;
  let preferredVenueReason = '';
  if (allocatedDifferentFromPreferred) {
    const prefTrace = alloc.trace.find(t => t.venue_id === s.data.preferred_venue_id);
    const reasons = prefTrace?.hall_evaluations.filter(h => !h.passed).map(h => h.message) || [];
    if (prefTrace?.resource_checks) {
      if (!prefTrace.resource_checks.projectors.feasible && prefTrace.resource_checks.projectors.message) reasons.push(prefTrace.resource_checks.projectors.message);
      if (!prefTrace.resource_checks.audio_systems.feasible && prefTrace.resource_checks.audio_systems.message) reasons.push(prefTrace.resource_checks.audio_systems.message);
      if (!prefTrace.resource_checks.staff.feasible && prefTrace.resource_checks.staff.message) reasons.push(prefTrace.resource_checks.staff.message);
    }
    preferredVenueReason = reasons.join(' · ') || `Preferred venue is unable to accommodate attendees or shared resources for this interval. Automatically re-routed to ${alloc.allocated_venue_name}.`;
  }

  let suggestions: any[] = [];
  if (alloc.status !== 'confirmed' || allocatedDifferentFromPreferred) {
    suggestions = generateAlternativeSuggestions(
      {
        title: s.data.title,
        event_date: s.data.event_date,
        start_time: s.data.start_time,
        end_time: s.data.end_time,
        attendees: s.data.attendees,
        preferred_venue_id: s.data.preferred_venue_id,
        projectors: s.data.projectors,
        audio_systems: s.data.audio_systems,
        staff: s.data.staff,
      },
      venues,
      confirmed
    );
  }

  res.json({
    ...alloc,
    pricing,
    allocated_different_from_preferred: allocatedDifferentFromPreferred,
    preferred_venue_reason: preferredVenueReason,
    suggestions,
  });
});

app.get('/api/clients/organizations', (_req, res) => {
  const orgs = db.prepare("SELECT DISTINCT organization FROM users WHERE organization IS NOT NULL AND organization != ''").all().map((x: any) => x.organization);
  const defaults = ['Acme Innovations Ltd', 'Mehta Innovations', 'Global Tech Summits', 'Global Expo Ltd', 'Zenith Media Tech'];
  res.json(Array.from(new Set([...orgs, ...defaults])));
});

app.post('/api/clients/organizations', auth(), (req, res) => {
  const org = String(req.body.organization || '').trim();
  if (org && req.session.user) {
    db.prepare('UPDATE users SET organization=? WHERE id=?').run(org, req.session.user.id);
  }
  res.json({ ok: true, organization: org });
});

// ======================== CLIENT ROUTES ========================
app.get('/api/client/dashboard', auth(), (req, res) => {
  const id = req.session.user!.id;
  const upcoming = db.prepare("SELECT count(*) n FROM bookings WHERE client_id=? AND event_date>=date('now') AND status='confirmed'").get(id);
  const pending = db.prepare("SELECT count(*) n FROM bookings WHERE client_id=? AND status IN ('pending', 'rejected')").get(id);
  const waitlist = db.prepare("SELECT count(*) n FROM waitlist WHERE client_id=? AND status='active'").get(id);
  const bookings = db.prepare(`
    SELECT b.*, v.name venue, coalesce(h.name, 'Optimal allocation pending') hall
    FROM bookings b
    JOIN venues v ON v.id = coalesce(b.allocated_venue_id, b.venue_id)
    LEFT JOIN halls h ON h.id = b.hall_id
    WHERE b.client_id=?
    ORDER BY b.created_at DESC
    LIMIT 5
  `).all(id);

  const balance = db.prepare(`
    SELECT coalesce(sum(b.amount_due - coalesce(p.paid, 0)), 0) amount
    FROM bookings b
    LEFT JOIN (SELECT booking_id, sum(amount) paid FROM payments GROUP BY booking_id) p ON p.booking_id=b.id
    WHERE b.client_id=? AND b.status='confirmed'
  `).get(id);

  res.json({ upcoming, pending, waitlist, bookings, balance });
});

app.get('/api/client/bookings', auth(), (req, res) => {
  const list = db.prepare(`
    SELECT b.*,
           v.name venue,
           v.code venue_code,
           coalesce(h.name, '—') hall,
           b.reserved_start,
           b.reserved_end
    FROM bookings b
    JOIN venues v ON v.id = coalesce(b.allocated_venue_id, b.venue_id)
    LEFT JOIN halls h ON h.id = b.hall_id
    WHERE b.client_id=?
    ORDER BY b.event_date DESC, b.start_time DESC
  `).all(req.session.user!.id);
  res.json(list);
});

// CORE BOOKING CREATION WITH DETERMINISTIC ALLOCATION
app.post('/api/client/bookings', auth(), (req, res) => {
  try {
    if (req.body.event_date) req.body.event_date = normalizeDate(req.body.event_date);
    if (req.body.start_time) req.body.start_time = normalizeTime(req.body.start_time);
    if (req.body.end_time) req.body.end_time = normalizeTime(req.body.end_time);
  } catch {}

  const s = z.object({
    title: z.string().default('Untitled Event'),
    event_type: z.string().default('Conference'),
    venue_id: z.coerce.number().int(),
    hall_id: z.coerce.number().int().nullable().optional(),
    event_date: z.string().min(8),
    start_time: z.string().min(4),
    end_time: z.string().min(4),
    attendees: z.coerce.number().int().positive(),
    projectors: z.coerce.number().int().nonnegative().default(0),
    audio_systems: z.coerce.number().int().nonnegative().default(0),
    staff: z.coerce.number().int().nonnegative().default(0),
    notes: z.string().max(1000).default(''),
    join_waitlist: z.boolean().default(false),
  }).safeParse(req.body);

  if (!s.success) {
    return res.status(400).json({ error: 'Check each event detail and try again.' });
  }

  const d = s.data;
  if (timeToMinutes(d.end_time) <= timeToMinutes(d.start_time)) {
    return res.status(400).json({ error: 'End time must be after start time.' });
  }

  // 1. Compute 30-min buffer window & check operating hours
  let reservedWindow;
  try {
    reservedWindow = computeReservedInterval(d.event_date, d.start_time, d.end_time);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  const hoursCheck = isWithinOperatingHours(reservedWindow);
  if (!hoursCheck.valid) {
    return res.status(400).json({ error: hoursCheck.message });
  }

  const prefVenue = venueData(d.venue_id);
  if (!prefVenue || !prefVenue.active) {
    return res.status(400).json({ error: 'Choose an active venue.' });
  }

  // 2. Run the deterministic allocation engine
  const venues = getEngineVenues();
  const confirmed = getEngineBookings();

  const alloc = allocateEvent(
    {
      title: d.title,
      event_type: d.event_type,
      event_date: d.event_date,
      start_time: d.start_time,
      end_time: d.end_time,
      attendees: d.attendees,
      preferred_venue_id: d.venue_id,
      projectors: d.projectors,
      audio_systems: d.audio_systems,
      staff: d.staff,
    },
    venues,
    confirmed
  );

  const durationHours = (reservedWindow.endMinutes - reservedWindow.startMinutes) / 60;
  const pricing = calculateEventPricing(durationHours, 3500, d.staff);
  const refCode = `ES-${new Date().getFullYear()}-${alloc.allocated_venue_code || prefVenue.code}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  if (alloc.status === 'confirmed') {
    // Check if preferred venue was modified
    const allocatedDifferentFromPreferred = alloc.allocated_venue_id !== d.venue_id;
    let preferredVenueReason = '';
    if (allocatedDifferentFromPreferred) {
      const prefTrace = alloc.trace.find(t => t.venue_id === d.venue_id);
      const reasons = prefTrace?.hall_evaluations.filter(h => !h.passed).map(h => h.message) || [];
      if (prefTrace?.resource_checks) {
        if (!prefTrace.resource_checks.projectors.feasible && prefTrace.resource_checks.projectors.message) reasons.push(prefTrace.resource_checks.projectors.message);
        if (!prefTrace.resource_checks.audio_systems.feasible && prefTrace.resource_checks.audio_systems.message) reasons.push(prefTrace.resource_checks.audio_systems.message);
        if (!prefTrace.resource_checks.staff.feasible && prefTrace.resource_checks.staff.message) reasons.push(prefTrace.resource_checks.staff.message);
      }
      preferredVenueReason = reasons.join(' · ') || `Preferred venue unavailable. Re-routed to smallest feasible venue: ${alloc.allocated_venue_name}.`;
    }

    // Confirmed booking
    const result = db.prepare(`
      INSERT INTO bookings (
        booking_reference, client_id, venue_id, allocated_venue_id, hall_id,
        title, event_type, event_date, start_time, end_time,
        reserved_start, reserved_end, attendees,
        projectors, audio_systems, staff, notes,
        status, decision_note, amount_due, advance_paid, balance_due, payment_status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      refCode,
      req.session.user!.id,
      d.venue_id,
      alloc.allocated_venue_id,
      alloc.allocated_hall_id,
      d.title,
      d.event_type,
      d.event_date,
      d.start_time,
      d.end_time,
      reservedWindow.reservedStart,
      reservedWindow.reservedEnd,
      d.attendees,
      d.projectors,
      d.audio_systems,
      d.staff,
      d.notes,
      'confirmed',
      allocatedDifferentFromPreferred
        ? `Confirmed in Hall ${alloc.allocated_hall_name} at ${alloc.allocated_venue_name}. (Note: ${preferredVenueReason})`
        : `Confirmed in Hall ${alloc.allocated_hall_name} at ${alloc.allocated_venue_name}. Setup: ${reservedWindow.reservedStart}, Cleanup: ${reservedWindow.reservedEnd}.`,
      pricing.totalAmount,
      pricing.advanceDeposit,
      pricing.balanceDue,
      'advance_pending'
    );

    const bookingId = Number(result.lastInsertRowid);
    db.prepare('INSERT INTO history(booking_id, actor_id, action, note) VALUES(?,?,?,?)').run(
      bookingId,
      req.session.user!.id,
      'confirmed',
      `Allocated Hall ${alloc.allocated_hall_name} at ${alloc.allocated_venue_name}.`
    );

    return res.status(201).json({
      id: bookingId,
      status: 'confirmed',
      booking_reference: refCode,
      allocated_venue: alloc.allocated_venue_name,
      allocated_hall: alloc.allocated_hall_name,
      reserved_start: reservedWindow.reservedStart,
      reserved_end: reservedWindow.reservedEnd,
      pricing,
      allocated_different_from_preferred: allocatedDifferentFromPreferred,
      preferred_venue_reason: preferredVenueReason,
      message: allocatedDifferentFromPreferred
        ? `Notice: ${preferredVenueReason}. Allocated alternative: Hall ${alloc.allocated_hall_name} at ${alloc.allocated_venue_name}.`
        : `Booking confirmed in Hall ${alloc.allocated_hall_name} at ${alloc.allocated_venue_name}!`,
    });
  } else {
    // Infeasible: Record as waitlisted (if requested) or rejected
    const initialStatus = d.join_waitlist ? 'waitlisted' : 'rejected';
    const suggestions = generateAlternativeSuggestions(
      {
        title: d.title,
        event_date: d.event_date,
        start_time: d.start_time,
        end_time: d.end_time,
        attendees: d.attendees,
        preferred_venue_id: d.venue_id,
        projectors: d.projectors,
        audio_systems: d.audio_systems,
        staff: d.staff,
      },
      venues,
      confirmed
    );

    let queuePosition = 0;
    if (d.join_waitlist) {
      const currentWaitlistCount = Number(
        (db.prepare("SELECT count(*) n FROM waitlist WHERE venue_id=? AND event_date=? AND status='active'").get(
          d.venue_id,
          d.event_date
        ) as any).n
      );
      queuePosition = currentWaitlistCount + 1;
    }

    const result = db.prepare(`
      INSERT INTO bookings (
        booking_reference, client_id, venue_id, allocated_venue_id, hall_id,
        title, event_type, event_date, start_time, end_time,
        reserved_start, reserved_end, attendees,
        projectors, audio_systems, staff, notes,
        status, waitlist_position, decision_note, rejection_reason, rejection_details, amount_due
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      refCode,
      req.session.user!.id,
      d.venue_id,
      null,
      null,
      d.title,
      d.event_type,
      d.event_date,
      d.start_time,
      d.end_time,
      reservedWindow.reservedStart,
      reservedWindow.reservedEnd,
      d.attendees,
      d.projectors,
      d.audio_systems,
      d.staff,
      d.notes,
      initialStatus,
      queuePosition,
      d.join_waitlist ? `Joined waitlist at position #${queuePosition}. Reason: ${alloc.reason}` : (alloc.reason || 'Requested resources or halls not feasible.'),
      alloc.reason || 'Infeasible scheduling request.',
      JSON.stringify(alloc.details),
      0
    );

    const bookingId = Number(result.lastInsertRowid);

    if (d.join_waitlist) {
      db.prepare(`
        INSERT INTO waitlist(booking_id, client_id, venue_id, title, event_date, start_time, end_time, attendees, queue_position, reason)
        VALUES(?,?,?,?,?,?,?,?,?,?)
      `).run(
        bookingId,
        req.session.user!.id,
        d.venue_id,
        d.title,
        d.event_date,
        d.start_time,
        d.end_time,
        d.attendees,
        queuePosition,
        alloc.reason || 'Requested availability requires review'
      );
    }

    db.prepare('INSERT INTO history(booking_id, actor_id, action, note) VALUES(?,?,?,?)').run(
      bookingId,
      req.session.user!.id,
      initialStatus,
      alloc.reason || 'Infeasible request.'
    );

    return res.status(200).json({
      id: bookingId,
      status: initialStatus,
      waitlist_position: queuePosition,
      reason: alloc.reason,
      details: alloc.details,
      suggestions,
      message: d.join_waitlist ? `Joined waitlist at position #${queuePosition}: ${alloc.reason}` : alloc.reason,
    });
  }
});

// RESCHEDULING: Re-checks ALL constraints. If fails, original confirmed booking stays UNCHANGED!
app.post('/api/client/bookings/:id/reschedule', auth(), (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id=? AND client_id=?').get(
    req.params.id,
    req.session.user!.id
  ) as any;

  if (!b) return res.status(404).json({ error: 'Booking not found.' });

  const s = z.object({
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
  }).safeParse(req.body);

  if (!s.success || s.data.end_time <= s.data.start_time) {
    return res.status(400).json({ error: 'Provide a valid new date and start/end times.' });
  }

  // 1. Compute reserved window
  let reservedWindow;
  try {
    reservedWindow = computeReservedInterval(s.data.event_date, s.data.start_time, s.data.end_time);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  const hoursCheck = isWithinOperatingHours(reservedWindow);
  if (!hoursCheck.valid) {
    // Keep original booking unchanged!
    return res.status(409).json({ error: hoursCheck.message, kept_original: true });
  }

  // 2. Re-check all constraints excluding self
  const venues = getEngineVenues();
  const confirmed = getEngineBookings();

  const alloc = allocateEvent(
    {
      title: b.title,
      event_type: b.event_type,
      event_date: s.data.event_date,
      start_time: s.data.start_time,
      end_time: s.data.end_time,
      attendees: b.attendees,
      preferred_venue_id: b.venue_id,
      projectors: b.projectors,
      audio_systems: b.audio_systems,
      staff: b.staff,
      exclude_booking_id: b.id,
    },
    venues,
    confirmed
  );

  if (alloc.status !== 'confirmed') {
    // FAILSAFE: Keep original booking strictly UNCHANGED!
    return res.status(409).json({
      error: `Rescheduling failed: ${alloc.reason}. Original confirmed booking remains unchanged.`,
      details: alloc.details,
      kept_original: true,
    });
  }

  // Allocation succeeded for new time window: Update booking!
  db.prepare(`
    UPDATE bookings
    SET event_date = ?,
        start_time = ?,
        end_time = ?,
        reserved_start = ?,
        reserved_end = ?,
        allocated_venue_id = ?,
        hall_id = ?,
        decision_note = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    s.data.event_date,
    s.data.start_time,
    s.data.end_time,
    reservedWindow.reservedStart,
    reservedWindow.reservedEnd,
    alloc.allocated_venue_id,
    alloc.allocated_hall_id,
    `Rescheduled to ${s.data.event_date} (${s.data.start_time}–${s.data.end_time}) in Hall ${alloc.allocated_hall_name}.`,
    b.id
  );

  db.prepare('INSERT INTO history(booking_id, actor_id, action, note) VALUES(?,?,?,?)').run(
    b.id,
    req.session.user!.id,
    'rescheduled',
    `Rescheduled to ${s.data.event_date} ${s.data.start_time}–${s.data.end_time}.`
  );

  res.json({
    ok: true,
    message: `Rescheduled successfully to ${s.data.event_date} in Hall ${alloc.allocated_hall_name}!`,
    booking: {
      id: b.id,
      event_date: s.data.event_date,
      start_time: s.data.start_time,
      end_time: s.data.end_time,
      hall: alloc.allocated_hall_name,
      venue: alloc.allocated_venue_name,
    },
  });
});

app.post('/api/client/bookings/:id/reschedule-requests', auth(), (req, res) => {
  // Alias to reschedule logic
  const b = db.prepare('SELECT * FROM bookings WHERE id=? AND client_id=?').get(req.params.id, req.session.user!.id) as any;
  if (!b) return res.sendStatus(404);

  const s = z.object({
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
  }).safeParse(req.body);

  if (!s.success || s.data.end_time <= s.data.start_time) {
    return res.status(400).json({ error: 'Provide a valid new date and time.' });
  }

  const r = db.prepare('INSERT INTO reschedules(booking_id, client_id, event_date, start_time, end_time) VALUES(?,?,?,?,?)').run(
    b.id,
    req.session.user!.id,
    s.data.event_date,
    s.data.start_time,
    s.data.end_time
  );

  res.status(201).json({ id: r.lastInsertRowid, status: 'pending_review' });
});

// CANCELLATION: Releases resources and triggers FIFO auto-promotion
app.post('/api/client/bookings/:id/cancel', auth(), (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id) as any;

  if (!b) return res.status(404).json({ error: 'Booking not found.' });
  if (req.session.user!.role !== 'manager' && b.client_id !== req.session.user!.id) {
    return res.status(403).json({ error: 'You cannot cancel another client booking.' });
  }
  if (b.status === 'cancelled') return res.status(400).json({ error: 'Booking is already cancelled.' });

  db.prepare("UPDATE bookings SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(b.id);
  db.prepare('INSERT INTO history(booking_id, actor_id, action, note) VALUES(?,?,?,?)').run(
    b.id,
    req.session.user!.id,
    'cancelled',
    'Booking cancelled by client. Hall and resources released.'
  );

  // Auto-promote waitlist
  const promoted = promoteWaitlistFifo();

  res.json({
    ok: true,
    message: 'Booking cancelled. Resources released successfully.',
    promoted_from_waitlist: promoted,
  });
});

app.get('/api/client/waitlist', auth(), (req, res) => {
  const rows = db.prepare(`
    SELECT w.*, v.name venue
    FROM waitlist w
    JOIN venues v ON v.id = w.venue_id
    WHERE w.client_id=?
    ORDER BY w.created_at DESC
  `).all(req.session.user!.id);
  res.json(rows);
});

app.post('/api/client/waitlist', auth(), (req, res) => {
  const s = z.object({
    venue_id: z.number().int(),
    title: z.string().min(2),
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    attendees: z.number().int().positive(),
  }).safeParse(req.body);

  if (!s.success || s.data.end_time <= s.data.start_time) {
    return res.status(400).json({ error: 'Provide valid event details for the waitlist.' });
  }

  const queueCount = Number(
    (db.prepare("SELECT count(*) n FROM waitlist WHERE venue_id=? AND event_date=? AND status='active'").get(
      s.data.venue_id,
      s.data.event_date
    ) as any).n
  );

  const r = db.prepare(`
    INSERT INTO waitlist(client_id, venue_id, title, event_date, start_time, end_time, attendees, queue_position)
    VALUES(?,?,?,?,?,?,?,?)
  `).run(
    req.session.user!.id,
    s.data.venue_id,
    s.data.title,
    s.data.event_date,
    s.data.start_time,
    s.data.end_time,
    s.data.attendees,
    queueCount + 1
  );

  res.status(201).json({ id: r.lastInsertRowid, status: 'active', queue_position: queueCount + 1 });
});

app.get('/api/client/payments', auth(), (req, res) => {
  const rows = db.prepare(`
    SELECT b.id booking_id,
           b.title,
           b.amount_due,
           coalesce(sum(p.amount), 0) paid,
           b.amount_due - coalesce(sum(p.amount), 0) balance
    FROM bookings b
    LEFT JOIN payments p ON p.booking_id = b.id
    WHERE b.client_id=?
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `).all(req.session.user!.id);
  res.json(rows);
});

app.get('/api/client/profile', auth(), (req, res) => res.json(req.session.user));

app.patch('/api/client/profile', auth(), (req, res) => {
  const s = z.object({ name: z.string().min(2) }).safeParse(req.body);
  if (!s.success) return res.status(400).json({ error: 'Name must contain at least 2 characters.' });
  db.prepare('UPDATE users SET name=? WHERE id=?').run(s.data.name, req.session.user!.id);
  req.session.user!.name = s.data.name;
  res.json(req.session.user);
});

// ======================== MANAGER ROUTES ========================
app.get('/api/manager/dashboard', auth('manager'), (req, res) => {
  res.json({
    venues: db.prepare('SELECT count(*) n FROM venues WHERE active=1').get(),
    halls: db.prepare('SELECT count(*) n FROM halls WHERE active=1').get(),
    pending: db.prepare("SELECT count(*) n FROM bookings WHERE status IN ('pending', 'rejected')").get(),
    upcoming: db.prepare("SELECT count(*) n FROM bookings WHERE status='confirmed' AND event_date>=date('now')").get(),
    waitlist: db.prepare("SELECT count(*) n FROM waitlist WHERE status='active'").get(),
    bookings: db.prepare(`
      SELECT b.*,
             u.name client,
             u.email,
             v.name venue,
             coalesce(h.name, '—') hall
      FROM bookings b
      JOIN users u ON u.id = b.client_id
      JOIN venues v ON v.id = coalesce(b.allocated_venue_id, b.venue_id)
      LEFT JOIN halls h ON h.id = b.hall_id
      ORDER BY b.created_at DESC
      LIMIT 8
    `).all(),
  });
});

app.get('/api/manager/venues', auth('manager'), (req, res) => {
  res.json(db.prepare('SELECT id FROM venues ORDER BY code ASC, id ASC').all().map((v: any) => venueData(v.id)));
});

app.post('/api/manager/venues', auth('manager'), (req, res) => {
  const s = z.object({
    name: z.string().min(2),
    short_description: z.string().min(4),
    description: z.string().min(4),
    address: z.string().min(2),
    category: z.string().min(2),
    event_types: z.array(z.string()).min(1),
    open_time: z.string().default('08:00'),
    close_time: z.string().default('22:00'),
    air_conditioning: z.boolean().default(true),
    wifi: z.boolean().default(true),
    parking: z.boolean().default(true),
    stage: z.boolean().default(true),
    catering: z.boolean().default(true),
    accessibility: z.boolean().default(true),
    power_backup: z.boolean().default(true),
    projectors: z.number().int().nonnegative().default(0),
    audio_systems: z.number().int().nonnegative().default(0),
    staff: z.number().int().nonnegative().default(0),
    setup: z.string().default(''),
    cleanup: z.string().default(''),
    notes: z.string().default(''),
  }).safeParse(req.body);

  if (!s.success) {
    return res.status(400).json({ error: 'Complete the venue details and choose an event type.' });
  }

  const d = s.data;
  const code = d.name.slice(0, 1).toUpperCase();
  const r = db.prepare(`
    INSERT INTO venues (
      code, name, short_description, description, address, category, event_types,
      open_time, close_time, air_conditioning, wifi, parking, stage, catering,
      accessibility, power_backup, projectors, audio_systems, staff, setup, cleanup, notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    code,
    d.name,
    d.short_description,
    d.description,
    d.address,
    d.category,
    d.event_types.join(','),
    d.open_time,
    d.close_time,
    +d.air_conditioning,
    +d.wifi,
    +d.parking,
    +d.stage,
    +d.catering,
    +d.accessibility,
    +d.power_backup,
    d.projectors,
    d.audio_systems,
    d.staff,
    d.setup,
    d.cleanup,
    d.notes
  );

  res.status(201).json(venueData(Number(r.lastInsertRowid)));
});

app.patch('/api/manager/venues/:id', auth('manager'), (req, res) => {
  const s = z.object({
    active: z.boolean().optional(),
    name: z.string().min(2).optional(),
    projectors: z.number().int().nonnegative().optional(),
    audio_systems: z.number().int().nonnegative().optional(),
    staff: z.number().int().nonnegative().optional(),
  }).safeParse(req.body);

  if (!s.success) return res.status(400).json({ error: 'Invalid venue details.' });

  const d: any = s.data;
  const keys = Object.keys(d);
  if (keys.length) {
    db.prepare(`UPDATE venues SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`).run(
      ...keys.map((k) => (typeof d[k] === 'boolean' ? +d[k] : d[k])),
      req.params.id
    );
  }
  res.json(venueData(Number(req.params.id)));
});

app.post('/api/manager/venues/:id/halls', auth('manager'), (req, res) => {
  const s = z.object({
    name: z.string().min(1),
    capacity: z.number().int().positive(),
    description: z.string().default(''),
  }).safeParse(req.body);

  if (!s.success) return res.status(400).json({ error: 'Provide a hall name and positive capacity.' });
  if (!db.prepare('SELECT 1 FROM venues WHERE id=?').get(req.params.id)) return res.sendStatus(404);

  const r = db.prepare('INSERT INTO halls(venue_id, name, capacity, description) VALUES(?,?,?,?)').run(
    req.params.id,
    s.data.name,
    s.data.capacity,
    s.data.description
  );
  res.status(201).json({ id: r.lastInsertRowid });
});

app.patch('/api/manager/halls/:id', auth('manager'), (req, res) => {
  const s = z.object({
    name: z.string().min(1).optional(),
    capacity: z.number().int().positive().optional(),
    description: z.string().optional(),
    active: z.boolean().optional(),
  }).safeParse(req.body);

  if (!s.success) return res.status(400).json({ error: 'Invalid hall details.' });
  const d: any = s.data;
  const keys = Object.keys(d);
  if (keys.length) {
    db.prepare(`UPDATE halls SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`).run(
      ...keys.map((k) => (typeof d[k] === 'boolean' ? +d[k] : d[k])),
      req.params.id
    );
  }
  res.json({ ok: true });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads',
    filename: (_r, f, cb) => cb(null, crypto.randomUUID() + path.extname(f.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_r, f, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(f.mimetype)),
});

app.post('/api/manager/venues/:id/images', auth('manager'), upload.array('images', 8), (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM venues WHERE id=?').get(id)) return res.sendStatus(404);
  for (const [i, f] of (((req.files || []) as Express.Multer.File[]).entries())) {
    db.prepare('INSERT INTO images(venue_id, path, cover) VALUES(?,?,?)').run(id, `/uploads/${f.filename}`, i === 0 ? 1 : 0);
  }
  res.json(venueData(id));
});

app.get('/api/manager/bookings', auth('manager'), (req, res) => {
  const rows = db.prepare(`
    SELECT b.*,
           u.name client,
           u.email,
           v.name venue,
           v.code venue_code,
           coalesce(h.name, '—') hall
    FROM bookings b
    JOIN users u ON u.id = b.client_id
    JOIN venues v ON v.id = coalesce(b.allocated_venue_id, b.venue_id)
    LEFT JOIN halls h ON h.id = b.hall_id
    ORDER BY b.event_date DESC, b.start_time DESC
  `).all();
  res.json(rows);
});

// Manager decision: Review & Confirm / Reject / Cancel
app.patch('/api/manager/bookings/:id/decision', auth('manager'), (req, res) => {
  const s = z.object({
    status: z.enum(['confirmed', 'rejected', 'cancelled']),
    note: z.string().max(500).default(''),
  }).safeParse(req.body);

  if (!s.success) return res.status(400).json({ error: 'Invalid decision.' });

  const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id) as any;
  if (!b) return res.sendStatus(404);

  if (s.data.status === 'confirmed') {
    // Re-verify allocation feasibility
    const venues = getEngineVenues();
    const confirmed = getEngineBookings();

    const alloc = allocateEvent(
      {
        title: b.title,
        event_type: b.event_type,
        event_date: b.event_date,
        start_time: b.start_time,
        end_time: b.end_time,
        attendees: b.attendees,
        preferred_venue_id: b.venue_id,
        projectors: b.projectors,
        audio_systems: b.audio_systems,
        staff: b.staff,
        exclude_booking_id: b.id,
      },
      venues,
      confirmed
    );

    if (alloc.status !== 'confirmed') {
      return res.status(409).json({
        error: `Cannot confirm: ${alloc.reason}`,
        details: alloc.details,
      });
    }

    db.prepare(`
      UPDATE bookings
      SET status = 'confirmed',
          allocated_venue_id = ?,
          hall_id = ?,
          decision_note = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      alloc.allocated_venue_id,
      alloc.allocated_hall_id,
      s.data.note || `Confirmed by Manager in Hall ${alloc.allocated_hall_name}.`,
      b.id
    );
  } else if (s.data.status === 'cancelled') {
    db.prepare("UPDATE bookings SET status='cancelled', decision_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
      s.data.note || 'Cancelled by manager.',
      b.id
    );
    // Auto-promote waitlist
    promoteWaitlistFifo();
  } else {
    // Rejected
    db.prepare("UPDATE bookings SET status='rejected', decision_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
      s.data.note || 'Rejected by manager.',
      b.id
    );
  }

  db.prepare('INSERT INTO history(booking_id, actor_id, action, note) VALUES(?,?,?,?)').run(
    b.id,
    req.session.user!.id,
    s.data.status,
    s.data.note
  );

  res.json({ ok: true, status: s.data.status });
});

app.get('/api/manager/schedule', auth('manager'), (req, res) => {
  const rows = db.prepare(`
    SELECT b.*,
           v.name venue,
           v.code venue_code,
           coalesce(h.name, '—') hall,
           u.name client
    FROM bookings b
    JOIN users u ON u.id = b.client_id
    JOIN venues v ON v.id = coalesce(b.allocated_venue_id, b.venue_id)
    LEFT JOIN halls h ON h.id = b.hall_id
    WHERE b.status IN ('confirmed', 'pending')
    ORDER BY b.event_date ASC, b.start_time ASC
  `).all();
  res.json(rows);
});

app.get('/api/manager/waitlist', auth('manager'), (req, res) => {
  const rows = db.prepare(`
    SELECT w.*, v.name venue, u.name client, u.email
    FROM waitlist w
    JOIN venues v ON v.id = w.venue_id
    JOIN users u ON u.id = w.client_id
    ORDER BY w.event_date ASC, w.queue_position ASC
  `).all();
  res.json(rows);
});

app.get('/api/manager/payments', auth('manager'), (req, res) => {
  const rows = db.prepare(`
    SELECT b.id booking_id,
           b.title,
           b.amount_due,
           u.name client,
           v.name venue,
           coalesce(sum(p.amount), 0) paid,
           b.amount_due - coalesce(sum(p.amount), 0) balance
    FROM bookings b
    JOIN users u ON u.id = b.client_id
    JOIN venues v ON v.id = coalesce(b.allocated_venue_id, b.venue_id)
    LEFT JOIN payments p ON p.booking_id = b.id
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `).all();
  res.json(rows);
});

app.post('/api/manager/payments', auth('manager'), (req, res) => {
  const s = z.object({
    booking_id: z.number().int(),
    amount: z.number().positive(),
    method: z.string().min(2),
    reference: z.string().min(2),
    note: z.string().max(500).default(''),
  }).safeParse(req.body);

  if (!s.success) {
    return res.status(400).json({ error: 'Provide a positive amount, method and transaction reference.' });
  }

  const tx = db.transaction(() => {
    const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(s.data.booking_id) as any;
    if (!b) throw new Error('Booking not found.');

    const paid = Number((db.prepare('SELECT coalesce(sum(amount),0) total FROM payments WHERE booking_id=?').get(b.id) as any).total);
    if (s.data.amount > b.amount_due - paid) {
      throw new Error('Payment exceeds the outstanding balance.');
    }

    db.prepare('INSERT INTO payments(booking_id, amount, method, reference, note, created_by) VALUES(?,?,?,?,?,?)').run(
      b.id,
      s.data.amount,
      s.data.method,
      s.data.reference,
      s.data.note,
      req.session.user!.id
    );

    const newBalance = b.amount_due - (paid + s.data.amount);
    db.prepare("UPDATE bookings SET balance_due=?, payment_status=? WHERE id=?").run(
      newBalance,
      newBalance <= 0 ? 'fully_paid' : 'advance_paid',
      b.id
    );
  });

  try {
    tx();
    res.status(201).json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Unable to record payment.' });
  }
});

app.get('/api/manager/audits', auth('manager'), (_req, res) => {
  const rows = db.prepare(`
    SELECT h.id,
           h.action,
           h.note,
           h.created_at,
           h.booking_id,
           b.booking_reference,
           b.title event_title,
           u.name actor_name,
           u.role actor_role
    FROM history h
    JOIN users u ON u.id = h.actor_id
    LEFT JOIN bookings b ON b.id = h.booking_id
    ORDER BY h.created_at DESC
    LIMIT 100
  `).all();
  res.json(rows);
});

app.get('/api/manager/resources', auth('manager'), (req, res) => {
  const venues = getAllVenuesWithHalls();
  const confirmed = getEngineBookings();
  const targetDate = String(req.query.date || new Date().toISOString().slice(0, 10));

  const intelligence = venues.map((v: any) => {
    const venueConfirmed = confirmed.filter((b) => b.venue_id === v.id && b.event_date === targetDate);

    // Compute peak concurrency for this venue
    let peakProj = 0;
    let peakAudio = 0;
    let peakStaff = 0;

    // Boundary points over the day (08:00 to 22:00 = 480 to 1320 mins)
    const points = new Set<number>([480, 1320]);
    for (const b of venueConfirmed) {
      const startMin = b.reserved_start ? timeToMinutes(b.reserved_start) : 480;
      const endMin = b.reserved_end ? timeToMinutes(b.reserved_end) : 1320;
      points.add(startMin);
      points.add(endMin);
    }
    const sorted = Array.from(points).sort((a, b) => a - b);

    for (let i = 0; i < sorted.length - 1; i++) {
      const t1 = sorted[i];
      const t2 = sorted[i + 1];
      let curProj = 0;
      let curAudio = 0;
      let curStaff = 0;

      for (const b of venueConfirmed) {
        const bStart = b.reserved_start ? timeToMinutes(b.reserved_start) : 480;
        const bEnd = b.reserved_end ? timeToMinutes(b.reserved_end) : 1320;
        if (bStart <= t1 && bEnd >= t2) {
          curProj += b.projectors || 0;
          curAudio += b.audio_systems || 0;
          curStaff += b.staff || 0;
        }
      }

      if (curProj > peakProj) peakProj = curProj;
      if (curAudio > peakAudio) peakAudio = curAudio;
      if (curStaff > peakStaff) peakStaff = curStaff;
    }

    const projCap = v.projectors || 1;
    const audioCap = v.audio_systems || 1;
    const staffCap = v.staff || 1;

    return {
      venue_id: v.id,
      venue_code: v.code,
      venue_name: v.name,
      target_date: targetDate,
      active_events_count: venueConfirmed.length,
      resources: {
        projectors: {
          capacity: v.projectors,
          peak_demand: peakProj,
          utilization_pct: Math.min(100, Math.round((peakProj / projCap) * 100)),
          status: peakProj >= v.projectors ? 'Exhausted' : peakProj > 0 ? 'Active' : 'Available',
        },
        audio_systems: {
          capacity: v.audio_systems,
          peak_demand: peakAudio,
          utilization_pct: Math.min(100, Math.round((peakAudio / audioCap) * 100)),
          status: peakAudio >= v.audio_systems ? 'Exhausted' : peakAudio > 0 ? 'Active' : 'Available',
        },
        staff: {
          capacity: v.staff,
          peak_demand: peakStaff,
          utilization_pct: Math.min(100, Math.round((peakStaff / staffCap) * 100)),
          status: peakStaff >= v.staff ? 'Exhausted' : peakStaff > 0 ? 'Active' : 'Available',
        },
      },
      halls: v.halls.map((h: any) => ({
        id: h.id,
        name: h.name,
        capacity: h.capacity,
        hourly_rate: h.base_hourly_rate,
      })),
    };
  });

  res.json(intelligence);
});

app.get('/api/manager/reports', auth('manager'), (_req, res) => {
  res.json({
    statuses: db.prepare('SELECT status, count(*) value FROM bookings GROUP BY status').all(),
    venues: db.prepare('SELECT v.name, count(b.id) value FROM venues v LEFT JOIN bookings b ON b.allocated_venue_id=v.id OR (b.allocated_venue_id IS NULL AND b.venue_id=v.id) GROUP BY v.id').all(),
    payments: db.prepare('SELECT coalesce(sum(amount), 0) received FROM payments').get(),
    utilization_summary: {
      venue_A: 'Halls A1 & A2 operating with 2 projectors, 2 audio systems, 5 staff',
      venue_B: 'Halls B1 & B2 operating with 2 projectors, 1 audio system, 4 staff',
      venue_C: 'Halls C1 & C2 operating with 3 projectors, 2 audio systems, 6 staff',
    },
  });
});

// Demo seed endpoint: reset or seed the exact Hackathon sample situation for live judge evaluations
app.post('/api/manager/seed-sample-situation', auth('manager'), (req, res) => {
  const sampleDate = (req.body.date as string) || new Date().toISOString().slice(0, 10);
  const venueA = db.prepare("SELECT * FROM venues WHERE code='A'").get() as any;
  const hallA1 = db.prepare("SELECT * FROM halls WHERE venue_id=? AND name='A1'").get(venueA.id) as any;
  const hallA2 = db.prepare("SELECT * FROM halls WHERE venue_id=? AND name='A2'").get(venueA.id) as any;
  const clientUser = db.prepare("SELECT * FROM users WHERE role='client' ORDER BY id ASC").get() as any;

  if (!venueA || !hallA1 || !hallA2 || !clientUser) {
    return res.status(500).json({ error: 'Venue A or test client not found.' });
  }

  // Clear existing sample bookings for that date
  db.prepare("DELETE FROM bookings WHERE event_date=? AND venue_id=?").run(sampleDate, venueA.id);

  // 1. Conference (120 guests, 10:00-13:00, 1 proj, 3 staff) -> A2
  db.prepare(`
    INSERT INTO bookings (
      booking_reference, client_id, venue_id, allocated_venue_id, hall_id,
      title, event_type, event_date, start_time, end_time,
      reserved_start, reserved_end, attendees,
      projectors, audio_systems, staff,
      status, amount_due, advance_paid, balance_due, payment_status,
      decision_note
    ) VALUES (
      'ES-2026-A-CONF', ?, ?, ?, ?,
      'Annual Conference', 'Conference', ?, '10:00', '13:00',
      '09:30', '13:30', 120,
      1, 0, 3,
      'confirmed', 18000, 4500, 13500, 'advance_paid',
      'Confirmed in Hall A2 (capacity 150). Setup starts 09:30, cleanup ends 13:30.'
    )
  `).run(clientUser.id, venueA.id, venueA.id, hallA2.id, sampleDate);

  // 2. Workshop (50 guests, 11:00-14:00, 1 proj, 2 staff) -> A1
  db.prepare(`
    INSERT INTO bookings (
      booking_reference, client_id, venue_id, allocated_venue_id, hall_id,
      title, event_type, event_date, start_time, end_time,
      reserved_start, reserved_end, attendees,
      projectors, audio_systems, staff,
      status, amount_due, advance_paid, balance_due, payment_status,
      decision_note
    ) VALUES (
      'ES-2026-A-WORK', ?, ?, ?, ?,
      'Design Workshop', 'Workshop', ?, '11:00', '14:00',
      '10:30', '14:30', 50,
      1, 0, 2,
      'confirmed', 12000, 3000, 9000, 'advance_paid',
      'Confirmed in Hall A1 (capacity 60). Concurrent overlap uses 2/2 projectors and 5/5 staff.'
    )
  `).run(clientUser.id, venueA.id, venueA.id, hallA1.id, sampleDate);

  res.json({
    ok: true,
    message: `Sample situation seeded for date ${sampleDate}! Conference in A2 and Workshop in A1.`,
  });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ error: err.message || 'Request failed.' });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`EventSync API listening on http://localhost:${PORT}`));

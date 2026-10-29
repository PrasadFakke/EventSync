import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('data', { recursive: true });
fs.mkdirSync('uploads', { recursive: true });

export const db = new Database('data/eventsync.sqlite');
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('client', 'manager')),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  organization TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  short_description TEXT NOT NULL,
  description TEXT NOT NULL,
  address TEXT NOT NULL,
  category TEXT NOT NULL,
  event_types TEXT NOT NULL,
  open_time TEXT NOT NULL DEFAULT '08:00',
  close_time TEXT NOT NULL DEFAULT '22:00',
  active INTEGER DEFAULT 1,
  air_conditioning INTEGER DEFAULT 1,
  ac_notes TEXT DEFAULT '',
  wifi INTEGER DEFAULT 1,
  parking INTEGER DEFAULT 1,
  stage INTEGER DEFAULT 1,
  catering INTEGER DEFAULT 1,
  accessibility INTEGER DEFAULT 1,
  power_backup INTEGER DEFAULT 1,
  projectors INTEGER DEFAULT 0,
  audio_systems INTEGER DEFAULT 0,
  staff INTEGER DEFAULT 0,
  setup TEXT DEFAULT '',
  cleanup TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS halls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  base_hourly_rate REAL DEFAULT 3500.0,
  base_staff_assigned INTEGER DEFAULT 1,
  description TEXT DEFAULT '',
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  cover INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_reference TEXT,
  client_id INTEGER NOT NULL REFERENCES users(id),
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  allocated_venue_id INTEGER REFERENCES venues(id),
  hall_id INTEGER REFERENCES halls(id),
  title TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  reserved_start TEXT NOT NULL,
  reserved_end TEXT NOT NULL,
  attendees INTEGER NOT NULL,
  projectors INTEGER DEFAULT 0,
  audio_systems INTEGER DEFAULT 0,
  staff INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK(status IN ('confirmed', 'pending', 'rejected', 'cancelled', 'waitlisted')),
  waitlist_position INTEGER DEFAULT 0,
  decision_note TEXT DEFAULT '',
  rejection_reason TEXT DEFAULT '',
  rejection_details TEXT DEFAULT '',
  amount_due REAL DEFAULT 0,
  advance_paid REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reschedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES users(id),
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT DEFAULT 'pending_review',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  client_id INTEGER NOT NULL REFERENCES users(id),
  venue_id INTEGER NOT NULL REFERENCES venues(id),
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  attendees INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'promoted', 'cancelled')),
  queue_position INTEGER DEFAULT 1,
  reason TEXT DEFAULT 'Requested slot or shared resources exhausted',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK(amount > 0),
  method TEXT NOT NULL,
  reference TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS bookings_client ON bookings(client_id);
CREATE INDEX IF NOT EXISTS bookings_schedule ON bookings(venue_id, event_date, status);
CREATE INDEX IF NOT EXISTS waitlist_client ON waitlist(client_id);
CREATE INDEX IF NOT EXISTS payments_booking ON payments(booking_id);
`);

// Safe migrations for pre-existing sqlite files
const migrations = [
  'ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ""',
  'ALTER TABLE users ADD COLUMN organization TEXT DEFAULT ""',
  'ALTER TABLE venues ADD COLUMN code TEXT DEFAULT "A"',
  'ALTER TABLE halls ADD COLUMN base_hourly_rate REAL DEFAULT 3500.0',
  'ALTER TABLE halls ADD COLUMN base_staff_assigned INTEGER DEFAULT 1',
  'ALTER TABLE bookings ADD COLUMN booking_reference TEXT',
  'ALTER TABLE bookings ADD COLUMN allocated_venue_id INTEGER',
  'ALTER TABLE bookings ADD COLUMN reserved_start TEXT',
  'ALTER TABLE bookings ADD COLUMN reserved_end TEXT',
  'ALTER TABLE bookings ADD COLUMN waitlist_position INTEGER DEFAULT 0',
  'ALTER TABLE bookings ADD COLUMN rejection_reason TEXT',
  'ALTER TABLE bookings ADD COLUMN rejection_details TEXT',
  'ALTER TABLE bookings ADD COLUMN advance_paid REAL DEFAULT 0',
  'ALTER TABLE bookings ADD COLUMN balance_due REAL DEFAULT 0',
  'ALTER TABLE bookings ADD COLUMN payment_status TEXT DEFAULT "unpaid"',
  'ALTER TABLE bookings ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP',
  'ALTER TABLE waitlist ADD COLUMN queue_position INTEGER DEFAULT 1',
];

for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch {
    // Column already exists or table doesn't need it
  }
}

// Update venue codes if missing or default
try {
  db.prepare("UPDATE venues SET code='A' WHERE name LIKE '%Venue A%' OR code IS NULL OR code=''").run();
  db.prepare("UPDATE venues SET code='B' WHERE name LIKE '%Venue B%'").run();
  db.prepare("UPDATE venues SET code='C' WHERE name LIKE '%Venue C%'").run();
} catch {}

export function venueData(id: number) {
  const v = db.prepare('SELECT * FROM venues WHERE id=?').get(id) as any;
  if (!v) return null;
  v.event_types = v.event_types ? v.event_types.split(',') : [];
  v.halls = db.prepare('SELECT * FROM halls WHERE venue_id=? AND active=1 ORDER BY capacity ASC, id ASC').all(id);
  v.images = db.prepare('SELECT * FROM images WHERE venue_id=? ORDER BY id').all(id);
  return v;
}

export function getAllVenuesWithHalls() {
  const venues = db.prepare('SELECT * FROM venues WHERE active=1 ORDER BY code ASC, id ASC').all() as any[];
  for (const v of venues) {
    v.event_types = v.event_types ? v.event_types.split(',') : [];
    v.halls = db.prepare('SELECT * FROM halls WHERE venue_id=? AND active=1 ORDER BY capacity ASC, id ASC').all(v.id);
    v.images = db.prepare('SELECT * FROM images WHERE venue_id=? ORDER BY id').all(v.id);
  }
  return venues;
}

export function getAllConfirmedBookings() {
  return db.prepare("SELECT * FROM bookings WHERE status='confirmed'").all() as any[];
}

export function seed() {
  // 1. Seed Manager & Client Users
  const usersToSeed = [
    { email: 'admin@eventsync.com', pass: 'Admin@123', role: 'manager', name: 'Platform Administrator', org: 'EventSync Operations' },
    { email: 'manager@eventsync.local', pass: process.env.DEMO_MANAGER_PASSWORD || 'EventSync2026!', role: 'manager', name: 'Demo Manager', org: 'EventSync Operations' },
    { email: 'client@eventsync.local', pass: 'Client2026!', role: 'client', name: 'Aarav Mehta', org: 'Mehta Innovations' },
    { email: 'alex@acme.com', pass: 'Client@123', role: 'client', name: 'Alex Mercer', org: 'Acme Innovations Ltd' },
    { email: 'sarah@techsummit.org', pass: 'Client@123', role: 'client', name: 'Sarah Jenkins', org: 'Global Tech Summits' },
    { email: 'david@globalexpo.com', pass: 'Client@123', role: 'client', name: 'David Miller', org: 'Global Expo Ltd' },
  ];

  const insertUser = db.prepare('INSERT OR IGNORE INTO users(email, password_hash, role, name, organization) VALUES(?,?,?,?,?)');
  for (const u of usersToSeed) {
    insertUser.run(u.email.toLowerCase(), bcrypt.hashSync(u.pass, 10), u.role, u.name, u.org);
  }

  // 2. Check Venues
  const venueCount = Number((db.prepare('SELECT count(*) n FROM venues').get() as any).n);
  if (venueCount === 0) {
    const insertVenue = db.prepare(`
      INSERT INTO venues(
        code, name, short_description, description, address, category, event_types,
        open_time, close_time, active, air_conditioning, wifi, parking, stage,
        catering, accessibility, power_backup, projectors, audio_systems, staff, demo
      ) VALUES(?,?,?,?,?,?,?,?,?,1,1,1,1,1,1,1,1,?,?,?,1)
    `);

    const insertHall = db.prepare('INSERT INTO halls(venue_id, name, capacity, base_hourly_rate, base_staff_assigned) VALUES(?,?,?,?,?)');

    // Section 1.1 Specification dataset:
    // Venue A: A1: 60, A2: 150 | 2 projectors, 2 audio, 5 staff
    // Venue B: B1: 100, B2: 200 | 2 projectors, 1 audio, 4 staff
    // Venue C: C1: 80, C2: 250 | 3 projectors, 2 audio, 6 staff
    const venueList = [
      {
        code: 'A',
        name: 'Atrium House at BKC',
        short: 'A polished conference venue for leadership events, workshops, and launches.',
        desc: 'A flexible business-events venue in Bandra Kurla Complex with two configurable halls, modern AV, and an experienced support team.',
        address: 'Bandra Kurla Complex, Mumbai, Maharashtra 400051',
        category: 'Conference venue',
        types: 'Conferences,Workshops,Product launches',
        open: '08:00',
        close: '22:00',
        proj: 2,
        audio: 2,
        staff: 5,
        halls: [
          { name: 'A1', cap: 60, rate: 3000, staff: 2 },
          { name: 'A2', cap: 150, rate: 4500, staff: 3 },
        ],
      },
      {
        code: 'B',
        name: 'Harbourlight Convention Centre',
        short: 'A versatile Worli destination for conferences, exhibitions, and company events.',
        desc: 'A modern convention space in central Mumbai with flexible event halls, shared AV facilities, and dedicated event support.',
        address: 'Worli, Mumbai, Maharashtra 400018',
        category: 'Event venue',
        types: 'Conferences,Workshops,Exhibitions',
        open: '08:00',
        close: '22:00',
        proj: 2,
        audio: 1,
        staff: 4,
        halls: [
          { name: 'B1', cap: 100, rate: 3500, staff: 2 },
          { name: 'B2', cap: 200, rate: 5500, staff: 2 },
        ],
      },
      {
        code: 'C',
        name: 'Powai Lakeview Events Pavilion',
        short: 'A spacious lakeside setting for showcases, summits, and large gatherings.',
        desc: 'A contemporary Powai venue with a large-format pavilion, flexible breakout space, and comprehensive production support.',
        address: 'Powai, Mumbai, Maharashtra 400076',
        category: 'Exhibition venue',
        types: 'Exhibitions,Product launches,Conferences',
        open: '08:00',
        close: '22:00',
        proj: 3,
        audio: 2,
        staff: 6,
        halls: [
          { name: 'C1', cap: 80, rate: 3200, staff: 2 },
          { name: 'C2', cap: 250, rate: 6500, staff: 4 },
        ],
      },
    ];

    for (const v of venueList) {
      const res = insertVenue.run(
        v.code,
        v.name,
        v.short,
        v.desc,
        v.address,
        v.category,
        v.types,
        v.open,
        v.close,
        v.proj,
        v.audio,
        v.staff
      );
      const vId = Number(res.lastInsertRowid);
      for (const h of v.halls) {
        insertHall.run(vId, h.name, h.cap, h.rate, h.staff);
      }
    }
  }

  // 3. Seed a small set of realistic upcoming demonstration events.
  const bookingCount = Number((db.prepare('SELECT count(*) n FROM bookings').get() as any).n);
  if (bookingCount === 0) {
    const venueA = db.prepare("SELECT * FROM venues WHERE code='A'").get() as any;
    const hallA1 = db.prepare("SELECT * FROM halls WHERE venue_id=? AND name='A1'").get(venueA.id) as any;
    const hallA2 = db.prepare("SELECT * FROM halls WHERE venue_id=? AND name='A2'").get(venueA.id) as any;
    const venueB = db.prepare("SELECT * FROM venues WHERE code='B'").get() as any;
    const hallB2 = db.prepare("SELECT * FROM halls WHERE venue_id=? AND name='B2'").get(venueB.id) as any;
    const venueC = db.prepare("SELECT * FROM venues WHERE code='C'").get() as any;
    const hallC1 = db.prepare("SELECT * FROM halls WHERE venue_id=? AND name='C1'").get(venueC.id) as any;
    const clientUser = db.prepare("SELECT * FROM users WHERE role='client' ORDER BY id ASC").get() as any;

    if (venueA && hallA1 && hallA2 && venueB && hallB2 && venueC && hallC1 && clientUser) {
      const sampleDay = new Date();
      sampleDay.setDate(sampleDay.getDate() + 7);
      const sampleDate = [
        sampleDay.getFullYear(),
        String(sampleDay.getMonth() + 1).padStart(2, '0'),
        String(sampleDay.getDate()).padStart(2, '0'),
      ].join('-');

      const insertSampleBooking = db.prepare(`
        INSERT INTO bookings (
          booking_reference, client_id, venue_id, allocated_venue_id, hall_id,
          title, event_type, event_date, start_time, end_time,
          reserved_start, reserved_end, attendees, projectors, audio_systems, staff,
          status, amount_due, advance_paid, balance_due, payment_status, decision_note
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      const insertSampleHistory = db.prepare(
        "INSERT INTO history(booking_id, actor_id, action, note) VALUES(?,?,'confirmed',?)"
      );
      const events = [
        {
          reference: 'ES-DEMO-A-FORUM',
          venue: venueA,
          hall: hallA2,
          title: 'BKC Leadership & Innovation Summit',
          type: 'Conference',
          start: '10:00',
          end: '13:00',
          reservedStart: '09:30',
          reservedEnd: '13:30',
          attendees: 120,
          projectors: 1,
          audio: 1,
          staff: 3,
          total: 29736,
          advance: 7434,
          balance: 22302,
          note: 'Sample confirmed booking. Includes 30-minute setup and cleanup buffers.',
        },
        {
          reference: 'ES-DEMO-A-WORKSHOP',
          venue: venueA,
          hall: hallA1,
          title: 'Creative Strategy Workshop',
          type: 'Workshop',
          start: '11:00',
          end: '14:00',
          reservedStart: '10:30',
          reservedEnd: '14:30',
          attendees: 50,
          projectors: 1,
          audio: 0,
          staff: 2,
          total: 19824,
          advance: 4956,
          balance: 14868,
          note: 'Sample concurrent booking demonstrating shared venue resource allocation.',
        },
        {
          reference: 'ES-DEMO-B-EXPO',
          venue: venueB,
          hall: hallB2,
          title: 'Mumbai Harbour Technology Showcase',
          type: 'Exhibition',
          start: '10:30',
          end: '15:30',
          reservedStart: '10:00',
          reservedEnd: '16:00',
          attendees: 160,
          projectors: 2,
          audio: 1,
          staff: 4,
          total: 55932,
          advance: 13983,
          balance: 41949,
          note: 'Sample confirmed exhibition booking with shared AV and event support.',
        },
        {
          reference: 'ES-DEMO-C-FORUM',
          venue: venueC,
          hall: hallC1,
          title: 'Powai Founders & Investors Forum',
          type: 'Conference',
          start: '15:00',
          end: '18:00',
          reservedStart: '14:30',
          reservedEnd: '18:30',
          attendees: 75,
          projectors: 1,
          audio: 1,
          staff: 3,
          total: 15104,
          advance: 3776,
          balance: 11328,
          note: 'Sample confirmed forum booking. Includes 30-minute setup and cleanup buffers.',
        },
      ];

      for (const event of events) {
        const result = insertSampleBooking.run(
          event.reference,
          clientUser.id,
          event.venue.id,
          event.venue.id,
          event.hall.id,
          event.title,
          event.type,
          sampleDate,
          event.start,
          event.end,
          event.reservedStart,
          event.reservedEnd,
          event.attendees,
          event.projectors,
          event.audio,
          event.staff,
          'confirmed',
          event.total,
          event.advance,
          event.balance,
          'advance_pending',
          event.note
        );
        insertSampleHistory.run(Number(result.lastInsertRowid), clientUser.id, event.note);
      }
    }
  }
}

export function resetOperationalDataAndSeed(): void {
  db.transaction(() => {
    db.prepare('DELETE FROM history').run();
    db.prepare('DELETE FROM payments').run();
    db.prepare('DELETE FROM reschedules').run();
    db.prepare('DELETE FROM waitlist').run();
    db.prepare('DELETE FROM bookings').run();
    db.prepare('DELETE FROM images').run();
    db.prepare('DELETE FROM halls').run();
    db.prepare('DELETE FROM venues').run();
    const hasSequenceTable = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
    ).get();
    if (hasSequenceTable) {
      db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('venues','halls','bookings','waitlist','history','images','payments','reschedules')").run();
    }
    seed();
  })();
}

if (process.env.EVENTSYNC_SKIP_AUTO_SEED !== '1') seed();

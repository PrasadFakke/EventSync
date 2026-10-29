import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, Compass, Menu,
  MapPin, Plus, Search, Shield, Users, Wind, X, LogOut, LayoutDashboard, Building2,
  ClipboardList, Wallet, Clock3, Sparkles, Activity, FileText, Calendar, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, PlusCircle
} from 'lucide-react';
import { api } from './api';
import './style.css';

type User = { id: number; email: string; role: 'client' | 'manager'; name: string; organization?: string };
const C = createContext<{ user: User | null; refresh: () => Promise<void> }>({ user: null, refresh: async () => {} });
const useAuth = () => useContext(C);
const img = 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1600&q=85';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = async () => {
    try {
      const res = await api('/auth/me');
      setUser(res.user || null);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  };

  useEffect(() => { refresh(); }, []);

  if (!ready) return <div className="loading">EventSync</div>;

  return (
    <C.Provider value={{ user, refresh }}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth/roles" element={<Roles />} />
        <Route path="/auth/:role/login" element={<Login />} />
        <Route path="/auth/client/register" element={<Register />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/venues/:id" element={<Venue />} />
        <Route path="/client/*" element={<Guard role="client"><Portal /></Guard>} />
        <Route path="/manager/*" element={<Guard role="manager"><Portal /></Guard>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </C.Provider>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  return (
    <header className="top">
      <Link className="brand" to="/">
        <span className="brand-mark">e</span> EventSync
      </Link>
      <button className="hamb" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
        {open ? <X /> : <Menu />}
      </button>
      <nav className={open ? 'nav open' : 'nav'}>
        <a href="/#how">How it works</a>
        <Link to="/explore">Explore venues</Link>
        {user ? (
          <>
            <Link to={user.role === 'manager' ? '/manager/dashboard' : '/client/new-booking'} className="sign font-bold">
              {user.name} ({user.role})
            </Link>
            <Link
              to={user.role === 'manager' ? '/manager/dashboard' : '/client/new-booking'}
              className="button button-dark small"
            >
              Enter Portal <ArrowUpRight size={15} />
            </Link>
          </>
        ) : (
          <>
            <a href="/#managers">For event managers</a>
            <Link to="/auth/roles" className="sign">Sign in</Link>
            <Link to="/auth/roles" className="button button-dark small">
              Get started <ArrowUpRight size={15} />
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

function Home() {
  const [venues, setVenues] = useState<any[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    api<any[]>('/public/venues').then(setVenues).catch(() => {});
  }, []);

  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><span className="dot" /> ONE SPACE. EVERY DETAIL.</span>
            <h1>Bring your next<br />big idea to the<br /><i>perfect space.</i></h1>
            <p>
              Deterministic multi-venue hall allocation, automated 30-minute setup buffers, and peak-concurrency shared resource management. Everything in sync.
            </p>
            <div className="hero-actions">
              <Link className="button button-red" to="/explore">
                Explore venues <ArrowRight size={17} />
              </Link>
              <Link className="text-link" to={user ? (user.role === 'client' ? '/client/new-booking' : '/manager/dashboard') : '/auth/roles'}>
                Plan an event <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="searchbox">
              <div>
                <MapPin />
                <label>WHERE<span>Mumbai, India</span></label>
              </div>
              <div>
                <CalendarDays />
                <label>WHAT'S THE OCCASION?<span>Conference, Workshop, Launch</span></label>
              </div>
              <Link to="/explore" aria-label="Search venues"><Search /></Link>
            </div>
          </div>
          <div className="hero-art">
            <img src={img} alt="A warmly lit event venue prepared for a gathering" />
            <div className="image-stamp">
              <span>MAKE ROOM<br />FOR WHAT'S<br /><i>NEXT.</i></span>
              <ArrowDown />
            </div>
            <div className="image-note">
              <span className="note-dot" /> Thoughtful spaces. Seamless plans.
            </div>
          </div>
          <div className="hero-index">01 <span /> 03</div>
        </section>

        <section id="how" className="how section">
          <div className="section-head">
            <div>
              <span className="eyebrow">A BETTER WAY TO GATHER</span>
              <h2>Less logistics.<br /><i>More magic.</i></h2>
            </div>
            <p>From the first venue search to peak resource checks, one considered place for everyone involved.</p>
          </div>
          <div className="steps">
            <div className="step step-one">
              <span>01 / FIND YOUR PLACE</span>
              <Compass />
              <h3>Discover</h3>
              <p>Explore Venue A, B, and C with exact hall capacities and shared AV/support staff pools.</p>
              <Link to="/explore">Explore spaces <ArrowRight size={15} /></Link>
            </div>
            <div className="step step-two">
              <span>02 / GET IT TOGETHER</span>
              <div className="mini-calendar">
                <b>OCT</b>
                <strong>30</strong>
                <span>Product launch</span>
                <Check />
              </div>
              <h3>Coordinate</h3>
              <p>Request date, times, attendees, projectors, and crew with automatic 30-min buffers.</p>
              <Link to={user ? (user.role === 'client' ? '/client/new-booking' : '/manager/dashboard') : '/auth/roles'}>
                Start planning <ArrowRight size={15} />
              </Link>
            </div>
            <div className="step step-three">
              <span>03 / MAKE IT HAPPEN</span>
              <div className="resource-art">
                <div>HALL A2 <b>↗</b></div>
                <div>AV POOL <b>✓</b></div>
                <div>SUPPORT CREW <b>✓</b></div>
              </div>
              <h3>Manage</h3>
              <p>Operations dashboard, timeline scheduling, and real-time resource intelligence.</p>
              <Link to="/auth/manager/login">For managers <ArrowRight size={15} /></Link>
            </div>
          </div>
        </section>

        <section className="featured section">
          <div className="featured-top">
            <div>
              <span className="eyebrow">INITIAL DATASET (SECTION 1.1)</span>
              <h2>Venues & Halls with<br /><i>Shared Resources.</i></h2>
            </div>
            <Link className="text-link" to="/explore">Explore all venues <ArrowUpRight size={16} /></Link>
          </div>
          <div className="venue-grid">
            {venues.slice(0, 3).map((v, i) => (
              <VenueCard key={v.id} v={v} index={i} />
            ))}
          </div>
        </section>

        <section id="managers" className="manager-band">
          <div className="manager-art">
            <img src="https://images.unsplash.com/photo-1507504031003-b417219a0dele?auto=format&fit=crop&w=1000&q=80" alt="Event team preparing a venue" onError={e => { (e.target as HTMLImageElement).src = img; }} />
            <div className="manager-card">
              <span>VENUE OPERATIONS</span>
              <b>One clear view.</b>
              <small>Spaces, schedules, shared resources.</small>
            </div>
          </div>
          <div>
            <span className="eyebrow">FOR THE PEOPLE BEHIND THE SCENES</span>
            <h2>Run your venues.<br /><i>Not your inbox.</i></h2>
            <p>Operations dashboard, schedule timelines, peak concurrency sweep-lines, and audit history logs.</p>
            <Link className="button button-lime" to="/auth/manager/login">
              Enter manager portal <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Footer() {
  return (
    <footer>
      <Link className="brand" to="/"><span className="brand-mark">e</span> EventSync</Link>
      <p>Your event. Your venue. All in sync.</p>
      <div>
        <Link to="/explore">Explore venues</Link>
        <Link to="/auth/roles">Get started</Link>
        <Link to="/auth/manager/login">For managers</Link>
      </div>
      <small>© 2026 EventSync · Mini Project ESE Hackathon</small>
    </footer>
  );
}

function VenueCard({ v, index = 0 }: { v: any; index?: number }) {
  return (
    <Link to={'/venues/' + v.id} className={'venue-card card-' + index}>
      <div className="venue-photo">
        <img
          src={v.images?.find((x: any) => x.cover)?.path || [
            img,
            'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=900&q=80',
            'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=900&q=80'
          ][index % 3]}
          alt={v.name}
        />
        <span>VENUE {v.code}</span>
        <ArrowUpRight />
      </div>
      <div className="venue-meta">
        <div>
          <h3>{v.name}</h3>
          <p><MapPin size={14} />{v.address || 'Mumbai'}</p>
        </div>
        <b>{v.halls?.reduce((a: number, h: any) => Math.max(a, h.capacity), 0) || '—'}<small> max seats</small></b>
      </div>
      <div className="venue-tags">
        <span>{v.projectors} Projectors</span>
        <span>{v.audio_systems} Audio</span>
        <span>{v.staff} Staff</span>
      </div>
    </Link>
  );
}

function Explore() {
  const [venues, setVenues] = useState<any[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    api<any[]>('/public/venues' + (q ? '?search=' + encodeURIComponent(q) : '')).then(setVenues);
  }, [q]);

  return (
    <>
      <Header />
      <main className="explore-page">
        <span className="eyebrow">THE EVENT STARTS HERE</span>
        <h1>Find a space<br />for <i>your kind of gathering.</i></h1>
        <p>Browse our venues, review hall capacities, and request booking with deterministic optimal allocation.</p>
        <div className="explore-search">
          <Search />
          <input placeholder="Search by venue name or address" value={q} onChange={e => setQ(e.target.value)} />
          <span>MUMBAI</span>
        </div>
        <div className="explore-grid">
          {venues.map((v, i) => (
            <VenueCard key={v.id} v={v} index={i} />
          ))}
        </div>
        {!venues.length && <p>No venues match that search.</p>}
      </main>
      <Footer />
    </>
  );
}

function Venue() {
  const { id } = useParams();
  const [v, setV] = useState<any>();
  const { user } = useAuth();

  useEffect(() => {
    api('/public/venues/' + id).then(setV);
  }, [id]);

  if (!v) return <div className="loading">Loading venue…</div>;

  const requestDestination = user
    ? (user.role === 'client' ? `/client/new-booking?venueId=${v.id}` : '/manager/venues')
    : `/auth/client/login?return=${encodeURIComponent(`/client/new-booking?venueId=${v.id}`)}`;

  return (
    <>
      <Header />
      <main className="venue-detail">
        <Link to="/explore" className="text-link">← All venues</Link>
        <div className="detail-hero">
          <img src={v.images?.[0]?.path || img} alt={v.name} />
          <div>
            <span className="eyebrow">VENUE {v.code} · {v.category}</span>
            <h1>{v.name}<br /><i>in Mumbai.</i></h1>
            <p>{v.description}</p>
            <Link className="button button-red" to={requestDestination}>
              Request this venue <ArrowRight />
            </Link>
          </div>
        </div>
        <div className="detail-columns">
          <section>
            <span className="eyebrow">THE SPACE</span>
            <h2>Rooms to make<br /><i>something happen.</i></h2>
            {v.halls?.map((h: any) => (
              <div key={h.id} className="hall-row">
                <b>Hall {h.name}</b>
                <span>{h.capacity} seated guests</span>
                <span>₹{h.base_hourly_rate || 3500}/hr</span>
              </div>
            ))}
          </section>
          <section>
            <span className="eyebrow">SHARED RESOURCE POOL</span>
            <div className="amenities">
              <div><Check size={16} /><span>Projectors: {v.projectors} in venue pool</span></div>
              <div><Check size={16} /><span>Audio Systems: {v.audio_systems} in venue pool</span></div>
              <div><Check size={16} /><span>Support Staff: {v.staff} on-site personnel</span></div>
              <div><Check size={16} /><span>Operating hours: {v.open_time} – {v.close_time}</span></div>
            </div>
            <p>{v.address} · Central Air Conditioning & Power Backup</p>
          </section>
        </div>
        <div className="request-band">
          <div>
            <span className="eyebrow">HAVE A DATE IN MIND?</span>
            <h2>Let's get the<br /><i>conversation started.</i></h2>
          </div>
          <Link className="button button-dark" to={requestDestination}>
            Request a booking <ArrowRight />
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Roles() {
  const { user } = useAuth();
  if (user) {
    return <Navigate to={user.role === 'manager' ? '/manager/dashboard' : '/client/new-booking'} replace />;
  }

  return (
    <AuthShell>
      <div className="auth-intro">
        <span className="eyebrow">GOOD THINGS HAPPEN HERE</span>
        <h1>First, who's<br />planning?</h1>
        <p>Choose your EventSync experience.</p>
      </div>
      <div className="role-grid">
        <div>
          <span>01 / CLIENT</span>
          <Users />
          <h2>Plan your<br /><i>event.</i></h2>
          <p>Find venues, request bookings with instant feasibility checks, and track status.</p>
          <Link className="button button-red" to="/auth/client/login">Continue as Client <ArrowRight /></Link>
          <Link className="role-register" to="/auth/client/register">New here? Create an account</Link>
        </div>
        <div>
          <span>02 / EVENT MANAGER</span>
          <Building2 />
          <h2>Run your<br /><i>venues.</i></h2>
          <p>Operations dashboard, bookings & waitlists, schedule timelines, and resource intelligence.</p>
          <Link className="button button-dark" to="/auth/manager/login">Continue as Event Manager <ArrowRight /></Link>
          <small>Demo manager: <code>admin@eventsync.com</code> / <code>Admin@123</code></small>
        </div>
      </div>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <Link className="brand" to="/"><span className="brand-mark">e</span> EventSync</Link>
      <div className="auth-layout">
        <div className="auth-photo" style={{ backgroundImage: `url(${img})` }}>
          <span>Your event.<br /><i>Your venue.</i><br />All in sync.</span>
        </div>
        <div className="auth-body">{children}</div>
      </div>
    </div>
  );
}

function Login() {
  const { role } = useParams();
  const r = role === 'manager' ? 'manager' : 'client';
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // If already logged in, redirect straight away
  if (user) {
    const returnUrl = new URLSearchParams(location.search).get('return');
    return <Navigate to={returnUrl || (user.role === 'manager' ? '/manager/dashboard' : '/client/new-booking')} replace />;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      await api('/auth/' + r + '/login', {
        method: 'POST',
        body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
      });
      await refresh();
      const returnUrl = new URLSearchParams(location.search).get('return');
      nav(returnUrl || (r === 'manager' ? '/manager/dashboard' : '/client/new-booking'));
    } catch (x: any) {
      setError(x.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <span className="eyebrow">{r === 'manager' ? 'MANAGER PORTAL' : 'CLIENT PORTAL'}</span>
      <h1>Welcome<br /><i>back.</i></h1>
      <p>Sign in to your EventSync account.</p>
      <form onSubmit={submit}>
        <label>
          Email address
          <input
            name="email"
            type="email"
            required
            defaultValue={r === 'manager' ? 'admin@eventsync.com' : 'client@eventsync.local'}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            defaultValue={r === 'manager' ? 'Admin@123' : 'Client2026!'}
            placeholder="Your password"
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="button button-red full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
        </button>
      </form>
      {r === 'client' && (
        <p className="auth-switch">New to EventSync? <Link to="/auth/client/register">Create an account</Link></p>
      )}
      <Link className="auth-switch" to="/auth/roles">← Choose another role</Link>
    </AuthShell>
  );
}

function Register() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState('');

  if (user) {
    return <Navigate to={user.role === 'manager' ? '/manager/dashboard' : '/client/new-booking'} replace />;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get('password') !== f.get('confirm')) return setError('Passwords do not match.');
    try {
      await api('/auth/client/register', {
        method: 'POST',
        body: JSON.stringify({ name: f.get('name'), email: f.get('email'), password: f.get('password') }),
      });
      await refresh();
      nav('/client/new-booking');
    } catch (x: any) {
      setError(x.message || 'Registration failed.');
    }
  }

  return (
    <AuthShell>
      <span className="eyebrow">YOUR PLACE IN THE PLAN</span>
      <h1>Let's make<br /><i>it happen.</i></h1>
      <p>Create a free client account.</p>
      <form onSubmit={submit}>
        <label>Full name<input name="name" required minLength={2} /></label>
        <label>Email address<input name="email" type="email" required /></label>
        <label>Password<input name="password" type="password" minLength={6} required /></label>
        <label>Confirm password<input name="confirm" type="password" required /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="button button-red full">Create account <ArrowRight size={16} /></button>
      </form>
      <p className="auth-switch">Already registered? <Link to="/auth/client/login">Sign in</Link></p>
    </AuthShell>
  );
}

function Guard({ role, children }: { role: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={'/auth/' + role + '/login'} replace />;
  if (role === 'manager' && user.role !== 'manager') {
    return <Navigate to="/client/new-booking" replace />;
  }
  return <>{children}</>;
}

// ======================== MAIN PORTAL ========================
function Portal() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const isManagerRoute = location.pathname.startsWith('/manager');
  const manager = isManagerRoute;
  const base = manager ? '/manager' : '/client';
  const [data, setData] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');

  const path = location.pathname.split('/')[2] || (manager ? 'dashboard' : 'new-booking');

  const load = () => {
    setError('');
    let route = '';
    if (manager) {
      if (path === 'dashboard') route = '/manager/dashboard';
      else if (path === 'bookings') route = '/manager/bookings';
      else if (path === 'schedule') route = '/manager/schedule';
      else if (path === 'resources') route = '/manager/resources';
      else if (path === 'audits') route = '/manager/audits';
      else if (path === 'venues') route = '/manager/venues';
      else route = '/manager/dashboard';
    } else {
      if (path === 'new-booking') route = '/public/venues';
      else if (path === 'bookings') route = '/client/bookings';
      else if (path === 'venues') route = '/public/venues';
      else if (path === 'waitlist') route = '/client/waitlist';
      else if (path === 'payments') route = '/client/payments';
      else if (path === 'profile') route = '/client/profile';
      else route = '/client/bookings';
    }

    api(route)
      .then(x => {
        setData(x);
        setItems(Array.isArray(x) ? x : []);
      })
      .catch(x => setError(x.message));
  };

  useEffect(load, [path, manager]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    await refresh();
    nav('/');
  }

  // EXACT TABS REQUESTED BY USER FOR MANAGER & CLIENT:
  const managerTabs = [
    ['dashboard', 'Operations Dashboard', LayoutDashboard],
    ['bookings', 'Bookings & Waitlist', ClipboardList],
    ['schedule', 'Schedule Timeline', CalendarDays],
    ['resources', 'Resource Intelligence', Activity],
    ['audits', 'Audit History', FileText],
    ['venues', 'Venues & Halls', Building2],
  ];

  const clientTabs = [
    ['new-booking', 'New Booking', PlusCircle],
    ['bookings', 'My Bookings', CalendarDays],
    ['venues', 'Venues & Halls', Building2],
    ['waitlist', 'My Waitlist', Clock3],
    ['payments', 'Payments', Wallet],
    ['profile', 'Profile', Users],
  ];

  const links = manager ? managerTabs : clientTabs;

  return (
    <div className="portal">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">e</span> EventSync
        </Link>
        <small>{manager ? 'EVENT MANAGER WORKSPACE' : 'CLIENT BOOKING PORTAL'}</small>
        <nav>
          {links.map(([id, label, Icon]: any) => (
            <Link
              key={id}
              className={path === id ? 'active' : ''}
              to={base + '/' + id}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="side-user">
          <div className="avatar">{user?.name?.slice(0, 1).toUpperCase()}</div>
          <div>
            <b>{user?.name}</b>
            <small>{manager ? 'Event Manager' : (user?.organization || 'Client')}</small>
          </div>
          <button onClick={logout} aria-label="Log out" title="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="portal-main">
        <div className="portal-top">
          <span>
            EVENTSYNC 2026 <i>·</i> {manager ? 'OPERATIONS CONTROL' : 'CLIENT SCHEDULING WORKSPACE'}
          </span>
          <div className="avatar">{user?.name?.slice(0, 1).toUpperCase()}</div>
        </div>
        <div className="portal-content">
          {error && <p className="form-error">{error}</p>}
          {manager ? (
            <ManagerContent path={path} data={data} reload={load} />
          ) : (
            <ClientContent path={path} data={data} items={items} reload={load} />
          )}
        </div>
      </main>
    </div>
  );
}

// ======================== MANAGER CONTENT ========================
function ManagerContent({ path, data, reload }: { path: string; data: any; reload: () => void }) {
  if (!data && path !== 'dashboard') return <div className="loading">Loading workspace…</div>;

  // 1. Operations Dashboard
  if (path === 'dashboard') {
    return (
      <>
        <div className="dash-title">
          <div>
            <span className="eyebrow">OPERATIONS CONTROL · 2026</span>
            <h1>Operations Dashboard<i>.</i></h1>
            <p>Live visibility across venues, hall allocations, pending client requests, and shared resource pools.</p>
          </div>
        </div>

        <div className="metric-grid">
          {[
            ['Active venues', data?.venues?.n || 3, Building2],
            ['Configured halls', data?.halls?.n || 6, LayoutDashboard],
            ['Pending requests', data?.pending?.n || 0, Clock3],
            ['Confirmed upcoming', data?.upcoming?.n || 0, CalendarDays],
            ['Active waitlist', data?.waitlist?.n || 0, Users],
          ].map(([n, v, Icon]: any) => (
            <div key={n} className="metric">
              <Icon />
              <span>{n}</span>
              <b>{v ?? 0}</b>
            </div>
          ))}
        </div>

        <h2 className="list-heading">Recent Booking Requests</h2>
        <BookingTable rows={data?.bookings || []} manager reload={reload} />
      </>
    );
  }

  // 2. Bookings & Waitlist
  if (path === 'bookings') {
    return (
      <>
        <PageTitle
          title="Bookings & Waitlist"
          subtitle="Review client requests, approve deterministic allocations, and monitor FIFO waitlists."
        />
        <div className="mb-6">
          <BookingTable rows={data} manager reload={reload} />
        </div>
      </>
    );
  }

  // 3. Schedule Timeline
  if (path === 'schedule') {
    return (
      <>
        <PageTitle
          title="Schedule Timeline"
          subtitle="All confirmed and reserved intervals across operating hours (08:00–22:00) with 30-min setup/cleanup buffers."
        />
        <div className="timeline-card">
          <h3 className="font-bold text-lg mb-3">Operating Hours Grid (08:00 AM – 10:00 PM)</h3>
          <p className="text-xs text-gray-500 mb-4">
            Notice how every event reserves 30 minutes before for equipment setup and 30 minutes after for crew cleanup.
          </p>
          {data?.map((b: any) => (
            <div key={b.id} className="mb-4 p-3 bg-white border border-gray-200 rounded">
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-bold text-sm text-purple-900">{b.title}</span>
                <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold">{b.status}</span>
              </div>
              <div className="text-xs text-gray-600 mb-2">
                <b>Venue {b.venue_code || b.venue}</b> · {b.hall} · Client: <b>{b.client}</b> ({b.attendees} guests)
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-amber-100 text-amber-900 px-2 py-1 rounded">
                  Reserved with 30m buffers: <b>{b.reserved_start || b.start_time} – {b.reserved_end || b.end_time}</b>
                </span>
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">
                  Event: {b.start_time} – {b.end_time}
                </span>
                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">
                  {b.projectors} Proj · {b.audio_systems} Audio · {b.staff} Staff
                </span>
              </div>
            </div>
          ))}
          {!data?.length && <div className="empty">No events scheduled yet.</div>}
        </div>
      </>
    );
  }

  // 4. Resource Intelligence
  if (path === 'resources') {
    return (
      <>
        <PageTitle
          title="Resource Intelligence"
          subtitle="Peak-concurrency sweep-line analyzer monitoring shared projectors, audio systems, and staff capacity across venues."
        />
        <div className="intel-grid">
          {data?.map((v: any) => (
            <div key={v.venue_id} className="intel-card">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold text-purple-700">VENUE {v.venue_code}</span>
                  <h3>{v.venue_name}</h3>
                </div>
                <span className={`badge ${v.resources.staff.peak_demand >= v.resources.staff.capacity ? 'exhausted' : v.resources.staff.peak_demand > 0 ? 'busy' : 'optimal'}`}>
                  {v.resources.staff.peak_demand >= v.resources.staff.capacity ? 'Peak Demand' : 'Normal Load'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-4">{v.active_events_count} active bookings on {v.target_date}</p>

              {/* Projectors */}
              <div className="meter-row">
                <div className="meter-header">
                  <span>Projectors</span>
                  <span>{v.resources.projectors.peak_demand} / {v.resources.projectors.capacity} ({v.resources.projectors.utilization_pct}%)</span>
                </div>
                <div className="meter-bar">
                  <div
                    className={`meter-fill ${v.resources.projectors.utilization_pct >= 90 ? 'red' : v.resources.projectors.utilization_pct >= 50 ? 'amber' : 'green'}`}
                    style={{ width: `${v.resources.projectors.utilization_pct}%` }}
                  />
                </div>
              </div>

              {/* Audio Systems */}
              <div className="meter-row">
                <div className="meter-header">
                  <span>Audio Systems</span>
                  <span>{v.resources.audio_systems.peak_demand} / {v.resources.audio_systems.capacity} ({v.resources.audio_systems.utilization_pct}%)</span>
                </div>
                <div className="meter-bar">
                  <div
                    className={`meter-fill ${v.resources.audio_systems.utilization_pct >= 90 ? 'red' : v.resources.audio_systems.utilization_pct >= 50 ? 'amber' : 'green'}`}
                    style={{ width: `${v.resources.audio_systems.utilization_pct}%` }}
                  />
                </div>
              </div>

              {/* Support Staff */}
              <div className="meter-row">
                <div className="meter-header">
                  <span>Support Staff Pool</span>
                  <span>{v.resources.staff.peak_demand} / {v.resources.staff.capacity} ({v.resources.staff.utilization_pct}%)</span>
                </div>
                <div className="meter-bar">
                  <div
                    className={`meter-fill ${v.resources.staff.utilization_pct >= 90 ? 'red' : v.resources.staff.utilization_pct >= 50 ? 'amber' : 'green'}`}
                    style={{ width: `${v.resources.staff.utilization_pct}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-600">
                <b>Configured Halls:</b> {v.halls.map((h: any) => `${h.name} (${h.capacity} seats)`).join(', ')}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // 5. Audit History
  if (path === 'audits') {
    return (
      <>
        <PageTitle
          title="Audit History"
          subtitle="Immutable ledger of state transitions, allocation decisions, reschedules, and cancellations."
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>ACTION</th>
                <th>BOOKING REF</th>
                <th>EVENT</th>
                <th>ACTOR</th>
                <th>NOTE / AUDIT DETAILS</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((a: any) => (
                <tr key={a.id}>
                  <td><small>{a.created_at}</small></td>
                  <td>
                    <span className={`status ${a.action === 'confirmed' ? 'confirmed' : a.action === 'cancelled' || a.action === 'rejected' ? 'rejected' : 'pending'}`}>
                      {a.action}
                    </span>
                  </td>
                  <td><b>{a.booking_reference || `ID #${a.booking_id}`}</b></td>
                  <td>{a.event_title || '—'}</td>
                  <td>{a.actor_name} <small>({a.actor_role})</small></td>
                  <td>{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.length && <div className="empty">No audit history recorded yet.</div>}
        </div>
      </>
    );
  }

  // 6. Venues & Halls
  return (
    <>
      <PageTitle title="Venues & Halls" subtitle="Spaces, halls, seating capacities, and shared equipment inventory." />
      <div className="explore-grid">
        {data.map((v: any, i: number) => (
          <VenueCard key={v.id} v={v} index={i} />
        ))}
      </div>
      <CreateVenue reload={reload} />
    </>
  );
}

// ======================== CLIENT CONTENT ========================
function ClientContent({ path, data, items, reload }: { path: string; data: any; items: any[]; reload: () => void }) {
  // 1. New Booking (matching screenshot functionality)
  if (path === 'new-booking') {
    return (
      <>
        <NewBookingRequestForm reload={reload} />
      </>
    );
  }

  // 2. My Bookings
  if (path === 'bookings') {
    return (
      <>
        <div className="dash-title">
          <div>
            <span className="eyebrow">YOUR EVENT SPACE</span>
            <h1>My Bookings<i>.</i></h1>
            <p>Track your confirmed hall allocations, setup buffer times, and rescheduling options.</p>
          </div>
          <Link className="button button-red small" to="/client/new-booking">
            <Plus size={16} /> New Booking Request
          </Link>
        </div>
        <BookingTable rows={items} manager={false} reload={reload} />
      </>
    );
  }

  // 3. Venues & Halls
  if (path === 'venues') {
    return (
      <>
        <PageTitle title="Venues & Halls" subtitle="Explore available spaces, seating capacities, and equipment pools." />
        <div className="explore-grid">
          {items.map((v: any, i: number) => (
            <VenueCard key={v.id} v={v} index={i} />
          ))}
        </div>
      </>
    );
  }

  // 4. My Waitlist
  if (path === 'waitlist') {
    return (
      <>
        <PageTitle title="My Waitlist" subtitle="Your waitlisted requests with automatic FIFO promotion when slots open." />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>EVENT</th>
                <th>VENUE</th>
                <th>REQUESTED DATE & TIME</th>
                <th>ATTENDEES</th>
                <th>QUEUE POSITION</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {items.map((w: any) => (
                <tr key={w.id}>
                  <td><b>{w.title}</b></td>
                  <td>{w.venue}</td>
                  <td>{w.event_date}<small>{w.start_time}–{w.end_time}</small></td>
                  <td>{w.attendees}</td>
                  <td><span className="font-bold text-purple-700">Queue #{w.queue_position || 1}</span></td>
                  <td><span className="status pending">{w.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && <div className="empty">You have no active waitlist requests.</div>}
        </div>
      </>
    );
  }

  // 5. Payments
  if (path === 'payments') {
    return (
      <>
        <PageTitle title="Payments" subtitle="Transparent billing breakdowns with 18% GST and 25% advance escrow deposit." />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>BOOKING</th>
                <th>TOTAL AMOUNT (INC GST)</th>
                <th>ADVANCE DEPOSIT (25%)</th>
                <th>BALANCE DUE (75%)</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b: any) => (
                <tr key={b.booking_id}>
                  <td><b>{b.title}</b><small>Ref #{b.booking_id}</small></td>
                  <td>₹{b.amount_due}</td>
                  <td>₹{b.paid}</td>
                  <td>₹{b.balance}</td>
                  <td><span className={`status ${b.balance <= 0 ? 'confirmed' : 'pending'}`}>{b.balance <= 0 ? 'Paid' : 'Deposit Due'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && <div className="empty">No payment records yet.</div>}
        </div>
      </>
    );
  }

  // 6. Profile
  return (
    <>
      <PageTitle title="Your Profile" subtitle="Your client details and organization information." />
      <Profile data={data} />
    </>
  );
}

// Helper functions for tolerant date & time handling matching user input
function parseToIsoDate(d: string): string {
  const str = String(d || '').trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [day, m, y] = str.split('-');
    return `${y}-${m}-${day}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [day, m, y] = str.split('/');
    return `${y}-${m}-${day}`;
  }
  return str || '2026-10-30';
}

function parseTo24Time(t: string): string {
  const str = String(t || '').trim();
  const isPM = /pm/i.test(str);
  const isAM = /am/i.test(str);
  const clean = str.replace(/[^\d:]/g, '');
  const parts = clean.split(':');
  if (parts.length < 2) return str;
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10) || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// ======================== NEW BOOKING REQUEST FORM (MATCHING SCREENSHOT) ========================
function NewBookingRequestForm({ reload }: { reload?: () => void }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const preselectedVenue = queryParams.get('venueId');

  const [venues, setVenues] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [isNewOrg, setIsNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const today = new Date();
  const todayInputValue = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  // Keep the date and time values in the formats expected by native inputs.
  const [form, setForm] = useState({
    organization: user?.organization || 'Mehta Innovations',
    title: '',
    event_type: 'Conference',
    event_date: todayInputValue,
    start_time: '10:00',
    end_time: '13:00',
    attendees: 50,
    preferred_venue_id: preselectedVenue ? Number(preselectedVenue) : 1,
    projectors: 1,
    audio_systems: 1,
    staff: 2,
    join_waitlist: false,
  });

  const [feasibility, setFeasibility] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [submitError, setSubmitError] = useState('');

  // Load venues and organizations
  useEffect(() => {
    api<any[]>('/public/venues').then(res => {
      setVenues(res);
      if (!preselectedVenue && res.length) {
        setForm(f => ({ ...f, preferred_venue_id: res[0].id }));
      }
    }).catch(() => {});
    api<string[]>('/clients/organizations').then(setOrganizations).catch(() => {});
  }, [preselectedVenue]);

  // Live Allocation Feasibility Preview
  useEffect(() => {
    const isoDate = parseToIsoDate(form.event_date);
    const startTime = parseTo24Time(form.start_time);
    const endTime = parseTo24Time(form.end_time);

    if (!form.preferred_venue_id || !isoDate || !startTime || !endTime || !form.attendees) {
      return;
    }

    setChecking(true);
    const timer = setTimeout(() => {
      api('/public/check-feasibility', {
        method: 'POST',
        body: JSON.stringify({
          preferred_venue_id: Number(form.preferred_venue_id),
          event_date: isoDate,
          start_time: startTime,
          end_time: endTime,
          attendees: Number(form.attendees),
          projectors: Number(form.projectors),
          audio_systems: Number(form.audio_systems),
          staff: Number(form.staff),
          title: form.title,
        }),
      })
        .then(setFeasibility)
        .catch(() => setFeasibility(null))
        .finally(() => setChecking(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [form.preferred_venue_id, form.event_date, form.start_time, form.end_time, form.attendees, form.projectors, form.audio_systems, form.staff, form.title]);

  const update = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function handleNewClientOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      await api('/clients/organizations', {
        method: 'POST',
        body: JSON.stringify({ organization: newOrgName.trim() }),
      });
      setOrganizations(prev => Array.from(new Set([...prev, newOrgName.trim()])));
      setForm(f => ({ ...f, organization: newOrgName.trim() }));
      setIsNewOrg(false);
      setNewOrgName('');
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    setSubmitResult(null);

    try {
      const vId = Number(form.preferred_venue_id) || (venues[0]?.id ? Number(venues[0].id) : 1);
      const isoDate = parseToIsoDate(form.event_date);
      const startTime = parseTo24Time(form.start_time);
      const endTime = parseTo24Time(form.end_time);

      if (!isoDate || !startTime || !endTime) {
        throw new Error('Please provide valid date, start time, and end time.');
      }

      const res = await api('/client/bookings', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          event_type: form.event_type || 'Conference',
          venue_id: vId,
          event_date: isoDate,
          start_time: startTime,
          end_time: endTime,
          attendees: Number(form.attendees) || 50,
          projectors: Number(form.projectors) || 0,
          audio_systems: Number(form.audio_systems) || 0,
          staff: Number(form.staff) || 0,
          join_waitlist: Boolean(form.join_waitlist),
        }),
      });

      setSubmitResult(res);
      if (typeof reload === 'function') {
        try { reload(); } catch {}
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Unable to submit booking. Check all fields.');
    } finally {
      setSubmitting(false);
    }
  }

  const applyAlternative = (s: any) => {
    setForm(f => ({
      ...f,
      start_time: s.start_time,
      end_time: s.end_time,
      event_date: s.event_date || f.event_date,
      preferred_venue_id: s.venue_id || f.preferred_venue_id,
    }));
  };

  return (
    <div className="booking-split client-booking-layout">
      {/* Left Form: Matching the Screenshot */}
      <div className="booking-card-main">
        <h2>New Booking Request</h2>
        <p className="subtitle">
          Submit client requirements with automatic venue-order search, 30-minute buffers, and shared resource checks.
        </p>

        {submitError && (
          <div className="p-4 mb-5 rounded bg-red-50 border border-red-200 text-red-900 text-xs">
            <div className="flex items-center gap-2 font-bold mb-1">
              <AlertTriangle size={16} className="text-red-600" />
              Submission Notice
            </div>
            {submitError}
          </div>
        )}

        {submitResult && (
          <div className={`p-4 mb-6 rounded ${submitResult.status === 'confirmed' ? 'bg-green-50 border border-green-200 text-green-900' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
            <div className="flex items-center gap-2 font-bold mb-1">
              {submitResult.status === 'confirmed' ? <CheckCircle2 size={18} className="text-green-600" /> : <AlertTriangle size={18} className="text-amber-600" />}
              {submitResult.status === 'confirmed' ? 'Booking Successfully Confirmed!' : `Booking Status: ${submitResult.status}`}
            </div>
            <p className="text-xs mb-2">{submitResult.message}</p>
            {submitResult.allocated_venue && (
              <p className="text-xs">
                Allocated: <b>{submitResult.allocated_venue}</b> · <b>Hall {submitResult.allocated_hall}</b> (Ref: {submitResult.booking_reference})
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button type="button" className="button button-dark small" onClick={() => nav('/client/bookings')}>
                View in My Bookings <ArrowRight size={14} />
              </button>
              <button type="button" className="button button-ghost small" onClick={() => { setSubmitResult(null); }}>
                Book Another Event
              </button>
            </div>
          </div>
        )}

        <form className="client-booking-form" onSubmit={handleSubmit}>
          {/* CLIENT ORGANIZATION */}
          <div className="mb-4">
            <div className="field-header">
              <label htmlFor={isNewOrg ? 'new-client-organization' : 'booking-organization'}>CLIENT ORGANIZATION *</label>
              <button
                type="button"
                className="new-client-btn"
                onClick={() => setIsNewOrg(!isNewOrg)}
              >
                + New Client
              </button>
            </div>
            {isNewOrg ? (
              <div className="flex gap-2">
                <input
                  id="new-client-organization"
                  type="text"
                  placeholder="Enter organization name"
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  className="booking-input"
                />
                <button type="button" className="button button-dark small" onClick={handleNewClientOrg}>Add</button>
              </div>
            ) : (
              <select
                value={form.organization}
                onChange={e => update('organization', e.target.value)}
                id="booking-organization"
                className="booking-input"
                required
              >
                {organizations.map(org => (
                  <option key={org} value={org}>{org}</option>
                ))}
                {!organizations.includes(form.organization) && (
                  <option value={form.organization}>{form.organization}</option>
                )}
              </select>
            )}
          </div>

          {/* EVENT TITLE & EVENT TYPE */}
          <div className="booking-form-grid booking-form-grid-two">
            <div>
              <label htmlFor="booking-title">EVENT TITLE *</label>
              <input
                id="booking-title"
                required
                placeholder="e.g. AI Innovations Summit"
                value={form.title}
                onChange={e => update('title', e.target.value)}
                className="booking-input"
              />
            </div>
            <div>
              <label htmlFor="booking-event-type">EVENT TYPE</label>
              <select
                id="booking-event-type"
                value={form.event_type}
                onChange={e => update('event_type', e.target.value)}
                className="booking-input"
              >
                <option value="Conference">Conference</option>
                <option value="Workshop">Workshop</option>
                <option value="Exhibition">Exhibition</option>
                <option value="Product launch">Product launch</option>
              </select>
            </div>
          </div>

          {/* EVENT DATE, START TIME, END TIME */}
          <div className="booking-form-grid booking-form-grid-three">
            <div>
              <label htmlFor="booking-event-date">EVENT DATE *</label>
              <input
                id="booking-event-date"
                type="date"
                required
                value={form.event_date}
                onChange={e => update('event_date', e.target.value)}
                className="booking-input"
              />
            </div>
            <div>
              <label htmlFor="booking-start-time">START TIME *</label>
              <input
                id="booking-start-time"
                type="time"
                required
                value={form.start_time}
                onChange={e => update('start_time', e.target.value)}
                className="booking-input"
              />
            </div>
            <div>
              <label htmlFor="booking-end-time">END TIME *</label>
              <input
                id="booking-end-time"
                type="time"
                required
                value={form.end_time}
                onChange={e => update('end_time', e.target.value)}
                className="booking-input"
              />
            </div>
          </div>

          {/* EXPECTED ATTENDEES & PREFERRED VENUE */}
          <div className="booking-form-grid booking-form-grid-two">
            <div>
              <label htmlFor="booking-attendees">EXPECTED ATTENDEES *</label>
              <input
                id="booking-attendees"
                type="number"
                min="1"
                required
                value={form.attendees}
                onChange={e => update('attendees', e.target.value)}
                className="booking-input"
              />
            </div>
            <div>
              <label htmlFor="booking-venue">PREFERRED VENUE *</label>
              <select
                id="booking-venue"
                required
                value={form.preferred_venue_id || (venues[0]?.id ?? 1)}
                onChange={e => update('preferred_venue_id', Number(e.target.value))}
                className="booking-input"
              >
                {venues.map(v => (
                  <option key={v.id} value={v.id}>
                    Venue {v.code} - {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* REQUESTED SHARED RESOURCES (VENUE POOL) */}
          <div className="resource-pool-box">
            <h4>REQUESTED SHARED RESOURCES (VENUE POOL)</h4>
            <div className="resource-inputs-grid">
              <div>
                <label className="text-xs text-gray-600 block mb-1 font-semibold">Projectors:</label>
                <input
                  type="number"
                  min="0"
                  value={form.projectors}
                  onChange={e => update('projectors', e.target.value)}
                  className="w-full bg-white rounded border border-gray-300 p-2 text-center font-bold"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1 font-semibold">Audio Systems:</label>
                <input
                  type="number"
                  min="0"
                  value={form.audio_systems}
                  onChange={e => update('audio_systems', e.target.value)}
                  className="w-full bg-white rounded border border-gray-300 p-2 text-center font-bold"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 block mb-1 font-semibold">Support Staff:</label>
                <input
                  type="number"
                  min="0"
                  value={form.staff}
                  onChange={e => update('staff', e.target.value)}
                  className="w-full bg-white rounded border border-gray-300 p-2 text-center font-bold"
                />
              </div>
            </div>
          </div>

          {/* Waitlist Checkbox */}
          <label className="waitlist-checkbox-label">
            <input
              type="checkbox"
              checked={form.join_waitlist}
              onChange={e => update('join_waitlist', e.target.checked)}
            />
            <span>Automatically join waitlist if request cannot be accommodated immediately</span>
          </label>

          {/* Submit Button */}
          <button type="submit" className="submit-btn-green" disabled={submitting}>
            {submitting ? 'Submitting & Allocating…' : 'Submit & Allocate Booking'} <ArrowRight size={16} />
          </button>
        </form>
      </div>

      {/* Right Side: Live Allocation Feasibility Preview */}
      <div className="preview-card">
        <div className="preview-header">
          <Sparkles size={18} />
          <span>Live Allocation Feasibility Preview</span>
        </div>

        {checking ? (
          <div className="p-6 text-center text-xs text-gray-500">Checking availability across venues & resources…</div>
        ) : feasibility ? (
          <div>
            {/* Status Pill */}
            <div className={`preview-status-pill ${feasibility.status === 'confirmed' ? (feasibility.allocated_different_from_preferred ? 'rerouted' : 'feasible') : 'infeasible'}`}>
              {feasibility.status === 'confirmed' ? (
                feasibility.allocated_different_from_preferred ? (
                  <><AlertTriangle size={14} /> Feasible at Alternate Venue</>
                ) : (
                  <><CheckCircle2 size={14} /> Feasible & Ready to Confirm</>
                )
              ) : (
                <><XCircle size={14} /> Infeasible (Constraints Blocked)</>
              )}
            </div>

            {/* Reserved Interval With Buffers */}
            <div className="preview-row">
              <span>Reserved Interval:</span>
              <b>{feasibility.reserved_window?.reservedStart} – {feasibility.reserved_window?.reservedEnd}</b>
            </div>
            <div className="preview-row">
              <span>Setup / Cleanup:</span>
              <b>Mandatory 30m buffers included</b>
            </div>
            <div className="preview-row">
              <span>Operating Hours:</span>
              <b>08:00 – 22:00 (Valid)</b>
            </div>

            {/* Smallest Fitting Hall Allocation */}
            {feasibility.status === 'confirmed' && (
              <>
                <div className="preview-row">
                  <span>Allocated Venue:</span>
                  <b className="text-purple-800">{feasibility.allocated_venue_name} (Venue {feasibility.allocated_venue_code})</b>
                </div>
                <div className="preview-row">
                  <span>Smallest Fitting Hall:</span>
                  <b className="text-purple-800">{feasibility.allocated_hall_name}</b>
                </div>
              </>
            )}

            {/* CRUCIAL REQUIREMENT: REASONING IF PREFERRED LOCATION CANNOT BE GIVEN */}
            {feasibility.allocated_different_from_preferred && (
              <div className="preferred-warning-box">
                <strong>⚠️ Preferred Venue Notice:</strong>
                <p>{feasibility.preferred_venue_reason}</p>
                <p className="mt-1 font-bold text-purple-900">
                  Deterministically re-routed to next best option: {feasibility.allocated_venue_name} (Hall {feasibility.allocated_hall_name}).
                </p>
              </div>
            )}

            {/* If Infeasible: Show clear reasons */}
            {feasibility.status !== 'confirmed' && (
              <div className="failure-reason-box">
                <strong>Request Cannot Be Accommodated:</strong>
                <p>{feasibility.reason}</p>
                {feasibility.details?.length > 0 && (
                  <ul className="mt-2 pl-4 list-disc text-xs">
                    {feasibility.details.map((d: string, i: number) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Dynamic Pricing Preview */}
            {feasibility.pricing && (
              <div className="pricing-block">
                <h5>Estimated Pricing Breakdown</h5>
                <div className="pricing-line">
                  <span>Duration ({feasibility.pricing.durationHours} hrs):</span>
                  <span>₹{feasibility.pricing.hallCharge}</span>
                </div>
                <div className="pricing-line">
                  <span>Staff ({form.staff} crew):</span>
                  <span>₹{feasibility.pricing.staffCharge}</span>
                </div>
                <div className="pricing-line">
                  <span>GST Tax (18%):</span>
                  <span>₹{feasibility.pricing.taxAmount}</span>
                </div>
                <div className="pricing-total">
                  <span>Total Amount:</span>
                  <span>₹{feasibility.pricing.totalAmount}</span>
                </div>
                <div className="pricing-advance">
                  25% Advance Escrow: ₹{feasibility.pricing.advanceDeposit}
                </div>
              </div>
            )}

            {/* Feasible Best Alternatives (Smart Suggestions) */}
            {feasibility.suggestions?.length > 0 && (
              <div className="suggestion-list">
                <h5>Suggested Feasible Alternatives:</h5>
                {feasibility.suggestions.map((s: any, idx: number) => (
                  <div
                    key={idx}
                    className="suggestion-pill"
                    onClick={() => applyAlternative(s)}
                    title="Click to apply this time slot to form"
                  >
                    <div>
                      <b>{s.title}</b>
                      <div className="text-gray-500 text-[10px]">{s.description}</div>
                    </div>
                    <span className="text-xs text-purple-700 font-bold ml-2">Apply →</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-gray-400">
            Enter event timing and attendees to generate live feasibility preview.
          </div>
        )}
      </div>
    </div>
  );
}

// ======================== BOOKING TABLE COMPONENT ========================
function BookingTable({ rows, manager, reload }: { rows: any[]; manager: boolean; reload: () => void }) {
  async function decide(id: number, status: string) {
    const note = status === 'rejected' ? prompt('Reason for rejection?') || 'Rejected by manager' : '';
    try {
      await api(`/manager/bookings/${id}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({ status, note }),
      });
      reload();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function cancelBooking(id: number) {
    if (!confirm('Are you sure you want to cancel this booking? Hall and resources will be released.')) return;
    try {
      const res = await api(`/client/bookings/${id}/cancel`, { method: 'POST' });
      alert(res.message);
      reload();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function promptReschedule(b: any) {
    const newDate = prompt('New Date (YYYY-MM-DD):', b.event_date);
    if (!newDate) return;
    const newStart = prompt('New Start Time (HH:MM):', b.start_time);
    if (!newStart) return;
    const newEnd = prompt('New End Time (HH:MM):', b.end_time);
    if (!newEnd) return;

    try {
      const res = await api(`/client/bookings/${b.id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ event_date: newDate, start_time: newStart, end_time: newEnd }),
      });
      alert(res.message);
      reload();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>EVENT</th>
            <th>{manager ? 'CLIENT / ORG' : 'ALLOCATED VENUE & HALL'}</th>
            <th>DATE & RESERVED INTERVAL</th>
            <th>ATTENDEES</th>
            <th>STATUS</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map(b => (
            <tr key={b.id}>
              <td>
                <b>{b.title}</b>
                <small>Ref: {b.booking_reference || `#${b.id}`}</small>
                {b.decision_note && (
                  <small className="block text-purple-900 bg-purple-50 p-1 rounded mt-1">
                    {b.decision_note}
                  </small>
                )}
                {b.rejection_reason && (
                  <small className="block text-red-900 bg-red-50 p-1 rounded mt-1">
                    {b.rejection_reason}
                  </small>
                )}
              </td>
              <td>
                {manager ? (
                  <>
                    <b>{b.client}</b>
                    <small>{b.email}</small>
                  </>
                ) : (
                  <>
                    <b>{b.venue}</b>
                    <small>Hall: {b.hall || 'Optimal allocation'}</small>
                  </>
                )}
              </td>
              <td>
                {b.event_date}
                <small>Event: {b.start_time}–{b.end_time}</small>
                {b.reserved_start && (
                  <small className="text-amber-800 font-semibold">
                    Buffers: {b.reserved_start}–{b.reserved_end}
                  </small>
                )}
              </td>
              <td>
                {b.attendees}
                <small>{b.projectors} proj · {b.audio_systems} audio · {b.staff} staff</small>
              </td>
              <td>
                <span className={'status ' + b.status}>{b.status}</span>
              </td>
              <td>
                {manager ? (
                  b.status === 'pending' || b.status === 'rejected' ? (
                    <div className="flex gap-1">
                      <button className="mini-action" onClick={() => decide(b.id, 'confirmed')}>Confirm</button>
                      <button className="mini-action reject" onClick={() => decide(b.id, 'rejected')}>Reject</button>
                    </div>
                  ) : b.status === 'confirmed' ? (
                    <button className="mini-action reject" onClick={() => decide(b.id, 'cancelled')}>Cancel</button>
                  ) : '—'
                ) : (
                  b.status === 'confirmed' ? (
                    <div className="flex gap-1">
                      <button className="mini-action" onClick={() => promptReschedule(b)}>Reschedule</button>
                      <button className="mini-action reject" onClick={() => cancelBooking(b.id)}>Cancel</button>
                    </div>
                  ) : '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows?.length && <div className="empty">No bookings found.</div>}
    </div>
  );
}

function CreateVenue({ reload }: { reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const v = await api<any>('/manager/venues', {
        method: 'POST',
        body: JSON.stringify({
          name: f.get('name'),
          short_description: f.get('short_description'),
          description: f.get('description'),
          address: f.get('address'),
          category: f.get('category'),
          event_types: String(f.get('event_types')).split(',').map(x => x.trim()).filter(Boolean),
          open_time: f.get('open_time') || '08:00',
          close_time: f.get('close_time') || '22:00',
          projectors: Number(f.get('projectors') || 0),
          audio_systems: Number(f.get('audio_systems') || 0),
          staff: Number(f.get('staff') || 0),
        }),
      });
      const hallName = f.get('hall_name'), cap = Number(f.get('capacity'));
      if (hallName && cap) {
        await api(`/manager/venues/${v.id}/halls`, {
          method: 'POST',
          body: JSON.stringify({ name: hallName, capacity: cap }),
        });
      }
      setOpen(false);
      reload();
    } catch (x: any) {
      setErr(x.message);
    }
  }

  return (
    <section className="create-card">
      <h2>Grow your collection.</h2>
      <p>Add a venue, configure its shared inventory, and add halls.</p>
      <button className="button button-dark" onClick={() => setOpen(!open)}>
        <Plus /> {open ? 'Close' : 'Add venue'}
      </button>
      {open && (
        <form className="booking-form" onSubmit={submit}>
          <div className="form-grid">
            {[
              ['name', 'Venue name'],
              ['short_description', 'Short description'],
              ['address', 'Location / address'],
              ['category', 'Venue category'],
              ['event_types', 'Event types (comma separated)'],
              ['description', 'Full description'],
              ['open_time', 'Opens at (default 08:00)'],
              ['close_time', 'Closes at (default 22:00)'],
              ['hall_name', 'First hall name'],
              ['capacity', 'Hall seating capacity'],
              ['projectors', 'Projectors in pool'],
              ['audio_systems', 'Audio systems in pool'],
              ['staff', 'Support staff pool'],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  required={!['hall_name', 'capacity', 'projectors', 'audio_systems', 'staff', 'open_time', 'close_time'].includes(key)}
                  type={key.includes('time') ? 'time' : key === 'capacity' || ['projectors', 'audio_systems', 'staff'].includes(key) ? 'number' : 'text'}
                />
              </label>
            ))}
          </div>
          {err && <p className="form-error">{err}</p>}
          <button className="button button-red mt-4">Save Venue <Check /></button>
        </form>
      )}
    </section>
  );
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="dash-title">
      <div>
        <span className="eyebrow">EVENTSYNC WORKSPACE</span>
        <h1>{title}<i>.</i></h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function Profile({ data }: { data: any }) {
  const [done, setDone] = useState(false);
  return (
    <form
      className="profile-form"
      onSubmit={async e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await api('/client/profile', {
          method: 'PATCH',
          body: JSON.stringify({ name: f.get('name') }),
        });
        setDone(true);
      }}
    >
      <label>Full name<input name="name" defaultValue={data?.name} /></label>
      <label>Organization<input defaultValue={data?.organization || '—'} readOnly /></label>
      <label>Email<input value={data?.email || ''} readOnly /></label>
      <button className="button button-dark">Save profile</button>
      {done && <span className="text-green-700 text-xs font-bold">Saved successfully!</span>}
    </form>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

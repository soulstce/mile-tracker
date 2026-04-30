'use client';

import { useEffect, useState } from 'react';

type Tab = 'current' | 'add' | 'records' | 'settings';
type PeriodStatus = 'open' | 'closed' | 'paid';

type Trip = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  from: string;
  to: string;
  miles: number;
  notes: string;
  createdAt: string;
};

type Period = {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  status: PeriodStatus;
  trips: Trip[];
};

type AppState = {
  rate: number;
  periods: Period[];
};

type TripForm = {
  date: string;
  startTime: string;
  endTime: string;
  from: string;
  to: string;
  miles: string;
  notes: string;
};

type DistanceLookupResult = {
  origin: string;
  destination: string;
  miles: number;
  source: string;
};

type DistanceLookupState = {
  origin: string;
  destination: string;
  loading: boolean;
  error: string;
  result: DistanceLookupResult | null;
};

const STORAGE_KEY = 'mile-tracker-state';
const DEFAULT_RATE = 0.5;
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

const navItems: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'current', label: 'Current', icon: 'current' },
  { id: 'add', label: 'Add Trip', icon: 'add' },
  { id: 'records', label: 'Records', icon: 'records' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

type IconName = 'current' | 'add' | 'records' | 'settings';

const makePeriod = (index: number): Period => ({
  id: index === 1 ? 'period-1' : createId(),
  name: `Period ${index}`,
  startedAt: new Date().toISOString(),
  endedAt: null,
  status: 'open',
  trips: []
});

const makeDefaultState = (): AppState => ({
  rate: DEFAULT_RATE,
  periods: [makePeriod(1)]
});

const blankForm = (): TripForm => ({
  date: '',
  startTime: '',
  endTime: '',
  from: '',
  to: '',
  miles: '',
  notes: ''
});

type GeocodeResult = {
  display_name: string;
  lat: string;
  lon: string;
};

async function geocodeLocation(query: string) {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error('Distance lookup is temporarily unavailable.');
  }

  const results = (await response.json()) as GeocodeResult[];
  const hit = results[0];
  if (!hit) {
    throw new Error(`No results found for "${query}".`);
  }

  return {
    label: hit.display_name,
    lat: Number(hit.lat),
    lon: Number(hit.lon)
  };
}

function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMiles = 3958.7613;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function lookupDistance(origin: string, destination: string) {
  const [originPoint, destinationPoint] = await Promise.all([
    geocodeLocation(origin),
    geocodeLocation(destination)
  ]);

  try {
    const routeResponse = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${originPoint.lon},${originPoint.lat};${destinationPoint.lon},${destinationPoint.lat}?overview=false&alternatives=false&steps=false`
    );
    if (routeResponse.ok) {
      const routeData = (await routeResponse.json()) as { routes?: Array<{ distance?: number }> };
      const routeDistance = routeData.routes?.[0]?.distance;
      if (typeof routeDistance === 'number' && Number.isFinite(routeDistance)) {
        return {
          origin: originPoint.label,
          destination: destinationPoint.label,
          miles: routeDistance / 1609.344,
          source: 'OpenStreetMap driving route'
        } satisfies DistanceLookupResult;
      }
    }
  } catch {
    // Fall back to a straight-line estimate if routing is unavailable.
  }

  return {
    origin: originPoint.label,
    destination: destinationPoint.label,
    miles: milesBetween(originPoint.lat, originPoint.lon, destinationPoint.lat, destinationPoint.lon),
    source: 'straight-line estimate'
  } satisfies DistanceLookupResult;
}

function createId() {
  if (typeof window !== 'undefined' && 'crypto' in window && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

function formatCurrency(value: number) {
  return currency.format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function escapeCsv(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function aggregate(trips: Trip[], rate: number) {
  const miles = trips.reduce((sum, trip) => sum + trip.miles, 0);
  return {
    miles,
    reimbursement: miles * rate,
    count: trips.length
  };
}

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate?.(10);
  }
}

function csvDownload(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function TabIcon({ name, active }: { name: IconName; active: boolean }) {
  const tone = active ? 'stroke-[#f5f3ff]' : 'stroke-white/55';
  const cls = `h-5 w-5 ${tone}`;

  switch (name) {
    case 'current':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden="true">
          <path d="M4 12h16" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 4v16" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M7 7l10 10" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
        </svg>
      );
    case 'add':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden="true">
          <path d="M12 5v14" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5 12h14" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'records':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden="true">
          <path d="M6 6h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" strokeWidth="1.8" />
          <path d="M8 10h8M8 13h8M8 16h5" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden="true">
          <path d="M4.5 8.5h15" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4.5 12h15" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4.5 15.5h15" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M9 6v12M15 6v12" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
        </svg>
      );
  }
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="text-[11px] uppercase tracking-[0.28em] text-white/40">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-sm text-white/55">{hint}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: string; tone: PeriodStatus }) {
  const styles: Record<PeriodStatus, string> = {
    open: 'border-emerald-400/20 bg-emerald-400/12 text-emerald-300',
    closed: 'border-white/10 bg-white/8 text-white/70',
    paid: 'border-violet-400/20 bg-violet-400/12 text-violet-300'
  };

  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[tone]}`}>{children}</span>;
}

export default function Page() {
  const [tab, setTab] = useState<Tab>('current');
  const [state, setState] = useState<AppState>(makeDefaultState);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<TripForm>(blankForm);
  const [distanceLookupOpen, setDistanceLookupOpen] = useState(false);
  const [distanceLookup, setDistanceLookup] = useState<DistanceLookupState>({
    origin: '',
    destination: '',
    loading: false,
    error: '',
    result: null
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        if (parsed?.periods?.length) {
          setState(parsed);
        }
      }
    } catch {
      setState(makeDefaultState());
    }

    setForm({
      date: todayIso(),
      startTime: currentTime(),
      endTime: currentTime(),
      from: '',
      to: '',
      miles: '',
      notes: ''
    });
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  const openPeriod = state.periods.find((period) => period.status === 'open');
  const latestPeriod = state.periods[state.periods.length - 1] ?? state.periods[0];
  const featuredPeriod = openPeriod ?? latestPeriod;
  const featuredTotals = aggregate(featuredPeriod?.trips ?? [], state.rate);
  const allTrips = state.periods.flatMap((period) => period.trips);
  const allTimeTotals = aggregate(allTrips, state.rate);
  const recentTrips = [...(featuredPeriod?.trips ?? [])].slice(-4).reverse();
  const periodCards = [...state.periods].reverse();
  const activeTripAllowed = Boolean(openPeriod);

  function updateState(next: AppState) {
    setState(next);
  }

  function startNewPeriod() {
    if (openPeriod) return;

    updateState({
      ...state,
      periods: [...state.periods, makePeriod(state.periods.length + 1)]
    });
    haptic();
  }

  function closePeriod(periodId: string) {
    updateState({
      ...state,
      periods: state.periods.map((period) =>
        period.id === periodId && period.status === 'open'
          ? { ...period, status: 'closed', endedAt: new Date().toISOString() }
          : period
      )
    });
    haptic();
  }

  function markPaid(periodId: string) {
    updateState({
      ...state,
      periods: state.periods.map((period) =>
        period.id === periodId && period.status === 'closed' ? { ...period, status: 'paid' } : period
      )
    });
    haptic();
  }

  function addTrip() {
    if (!openPeriod) return;

    const miles = Number(form.miles);
    if (!Number.isFinite(miles) || miles <= 0) return;

    const trip: Trip = {
      id: createId(),
      date: form.date || todayIso(),
      startTime: form.startTime || '',
      endTime: form.endTime || '',
      from: form.from.trim(),
      to: form.to.trim(),
      miles,
      notes: form.notes.trim(),
      createdAt: new Date().toISOString()
    };

    updateState({
      ...state,
      periods: state.periods.map((period) =>
        period.id === openPeriod.id ? { ...period, trips: [...period.trips, trip] } : period
      )
    });

    setForm({
      date: todayIso(),
      startTime: currentTime(),
      endTime: currentTime(),
      from: '',
      to: '',
      miles: '',
      notes: ''
    });
    haptic();
  }

  function exportCsv() {
    const lines = [
      [
        'type',
        'period_name',
        'period_status',
        'started_at',
        'ended_at',
        'date',
        'start_time',
        'end_time',
        'from',
        'to',
        'miles',
        'rate',
        'reimbursement',
        'notes'
      ]
        .map(escapeCsv)
        .join(',')
    ];

    state.periods.forEach((period) => {
      lines.push(
        [
          'period',
          period.name,
          period.status,
          period.startedAt,
          period.endedAt ?? '',
          '',
          '',
          '',
          '',
          '',
          '',
          state.rate,
          '',
          ''
        ]
          .map(escapeCsv)
          .join(',')
      );

      period.trips.forEach((trip) => {
        lines.push(
          [
            'trip',
            period.name,
            period.status,
            period.startedAt,
            period.endedAt ?? '',
            trip.date,
            trip.startTime,
            trip.endTime,
            trip.from,
            trip.to,
            trip.miles,
            state.rate,
            trip.miles * state.rate,
            trip.notes
          ]
            .map(escapeCsv)
            .join(',')
        );
      });
    });

    csvDownload(`mile-tracker-${todayIso()}.csv`, `${lines.join('\n')}\n`);
    haptic();
  }

  function clearData() {
    if (!window.confirm('Clear all periods and trips?')) return;
    const next = makeDefaultState();
    setState(next);
    setTab('current');
    haptic();
  }

  function setRate(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    updateState({
      ...state,
      rate: parsed
    });
  }

  function openDistanceLookup() {
    setDistanceLookup({
      origin: form.from,
      destination: form.to,
      loading: false,
      error: '',
      result: null
    });
    setDistanceLookupOpen(true);
  }

  function closeDistanceLookup() {
    setDistanceLookupOpen(false);
  }

  async function runDistanceLookup() {
    const origin = distanceLookup.origin.trim();
    const destination = distanceLookup.destination.trim();

    if (!origin || !destination) {
      setDistanceLookup((current) => ({
        ...current,
        error: 'Enter both locations first.'
      }));
      return;
    }

    setDistanceLookup((current) => ({
      ...current,
      loading: true,
      error: '',
      result: null
    }));

    try {
      const result = await lookupDistance(origin, destination);
      setDistanceLookup((current) => ({
        ...current,
        loading: false,
        error: '',
        result
      }));
      setForm((current) => ({
        ...current,
        miles: result.miles.toFixed(1)
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Distance lookup failed.';
      setDistanceLookup((current) => ({
        ...current,
        loading: false,
        error: message,
        result: null
      }));
    }
  }

  const statusLabel = featuredPeriod?.status ?? 'open';
  const currentAction =
    statusLabel === 'open'
      ? { label: 'Close period', onClick: () => closePeriod(featuredPeriod.id) }
      : statusLabel === 'closed'
        ? { label: 'Mark paid', onClick: () => markPaid(featuredPeriod.id) }
        : { label: 'Start new period', onClick: startNewPeriod };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05010a] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.22),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.14),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/8 to-transparent" />

      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <header className="mb-4 flex items-center justify-between gap-4">
          <p className="text-[11px] uppercase tracking-[0.32em] text-white/40">Mile Tracker</p>
          <div className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 shadow-[0_0_30px_rgba(168,85,247,0.18)] backdrop-blur-xl">
            {state.periods.length} periods
          </div>
        </header>

        <main className="flex-1 space-y-4">
          {tab === 'current' && (
            <div className="space-y-4">
              <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/35">Current period</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">{featuredPeriod.name}</h2>
                    <p className="mt-1 text-sm text-white/55">
                      {featuredPeriod.status === 'open'
                        ? 'Trip entry is live and editable.'
                        : featuredPeriod.status === 'closed'
                          ? 'This period is closed and waiting for payment.'
                          : 'This period is paid and locked.'}
                    </p>
                  </div>
                  <Badge tone={featuredPeriod.status}>{featuredPeriod.status.toUpperCase()}</Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <StatCard label="Miles" value={featuredTotals.miles.toFixed(1)} hint={`${featuredTotals.count} trips in this period`} />
                  <StatCard label="Reimbursement" value={formatCurrency(featuredTotals.reimbursement)} hint={`Rate ${formatCurrency(state.rate)}/mile`} />
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      currentAction.onClick();
                    }}
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-violet-500 px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition-all duration-200 active:scale-[0.98]"
                  >
                    {currentAction.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('add')}
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 backdrop-blur-xl transition-all duration-200 active:scale-[0.98]"
                  >
                    Add trip
                  </button>
                </div>
              </section>

              <section className="grid grid-cols-3 gap-3">
                <StatCard label="All miles" value={allTimeTotals.miles.toFixed(1)} hint={`${state.periods.length} periods total`} />
                <StatCard label="All reimbursement" value={formatCurrency(allTimeTotals.reimbursement)} hint="Local storage only" />
                <StatCard label="Rate" value={formatCurrency(state.rate)} hint="Per mile" />
              </section>

              <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Recent trips</h3>
                    <p className="text-sm text-white/50">Newest entries from the active period.</p>
                  </div>
                  <Badge tone={featuredPeriod.status}>{featuredPeriod.status}</Badge>
                </div>

                <div className="mt-4 space-y-3">
                  {recentTrips.length > 0 ? (
                    recentTrips.map((trip) => (
                      <div key={trip.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-medium text-white">{trip.from || 'Start'} → {trip.to || 'End'}</div>
                            <div className="mt-1 text-sm text-white/50">
                              {formatDate(trip.date)} · {trip.startTime || '--:--'} - {trip.endTime || '--:--'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-semibold text-violet-200">{trip.miles.toFixed(1)} mi</div>
                            <div className="text-sm text-white/50">{formatCurrency(trip.miles * state.rate)}</div>
                          </div>
                        </div>
                        {trip.notes ? <p className="mt-3 text-sm leading-6 text-white/65">{trip.notes}</p> : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/50">
                      No trips yet. Add your first drive from the Add Trip tab.
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {tab === 'add' && (
            <div className="space-y-4">
              <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Add trip</h2>
                    <p className="text-sm text-white/50">Auto-calculates reimbursement at {formatCurrency(state.rate)}/mile.</p>
                  </div>
                  <Badge tone={activeTripAllowed ? 'open' : 'closed'}>{activeTripAllowed ? 'OPEN' : 'LOCKED'}</Badge>
                </div>

                {!activeTripAllowed ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                    Start a new period before entering trips.
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => startNewPeriod()}
                        className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-violet-500 px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition-all duration-200 active:scale-[0.98]"
                      >
                        Start new period
                      </button>
                    </div>
                  </div>
                ) : (
                  <form
                    className="mt-4 grid gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addTrip();
                    }}
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm text-white/70">
                        Date
                        <input
                          type="date"
                          value={form.date}
                          onChange={(event) => setForm({ ...form, date: event.target.value })}
                          className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-0 placeholder:text-white/25 focus:border-violet-400/40"
                        />
                      </label>
                      <label className="grid gap-2 text-sm text-white/70">
                        Miles
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min="0"
                          placeholder="12.4"
                          value={form.miles}
                          onChange={(event) => setForm({ ...form, miles: event.target.value })}
                          className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-0 placeholder:text-white/25 focus:border-violet-400/40"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm text-white/70">
                        Start time
                        <input
                          type="time"
                          value={form.startTime}
                          onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                          className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-0 focus:border-violet-400/40"
                        />
                      </label>
                      <label className="grid gap-2 text-sm text-white/70">
                        End time
                        <input
                          type="time"
                          value={form.endTime}
                          onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                          className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-0 focus:border-violet-400/40"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm text-white/70">
                        From
                        <input
                          type="text"
                          value={form.from}
                          onChange={(event) => setForm({ ...form, from: event.target.value })}
                          placeholder="Home"
                          className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-0 placeholder:text-white/25 focus:border-violet-400/40"
                        />
                      </label>
                      <label className="grid gap-2 text-sm text-white/70">
                        To
                        <input
                          type="text"
                          value={form.to}
                          onChange={(event) => setForm({ ...form, to: event.target.value })}
                          placeholder="Client site"
                          className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-0 placeholder:text-white/25 focus:border-violet-400/40"
                        />
                      </label>
                    </div>

                    <label className="grid gap-2 text-sm text-white/70">
                      Notes
                      <textarea
                        rows={4}
                        value={form.notes}
                        onChange={(event) => setForm({ ...form, notes: event.target.value })}
                        placeholder="Parking, tolls, meeting notes, or route details."
                        className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-0 placeholder:text-white/25 focus:border-violet-400/40"
                      />
                    </label>

                    <div className="rounded-2xl border border-violet-400/15 bg-violet-500/10 p-4 text-sm text-white/70">
                      Estimate: <span className="font-semibold text-violet-200">{Number.isFinite(Number(form.miles)) ? formatCurrency(Number(form.miles) * state.rate || 0) : formatCurrency(0)}</span>
                    </div>

                    <button
                      type="submit"
                      className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-violet-500 px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition-all duration-200 active:scale-[0.98]"
                    >
                      Save trip
                    </button>

                    <button
                      type="button"
                      onClick={openDistanceLookup}
                      className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white/90 backdrop-blur-xl transition-all duration-200 active:scale-[0.98]"
                    >
                      Distance lookup
                    </button>
                  </form>
                )}
              </section>
            </div>
          )}

          {tab === 'records' && (
            <div className="space-y-4">
              <section className="grid grid-cols-2 gap-3">
                <StatCard label="Periods" value={String(state.periods.length)} hint={`${state.periods.filter((period) => period.status === 'paid').length} paid`} />
                <StatCard label="Trips" value={String(allTrips.length)} hint={`${state.periods.filter((period) => period.status === 'open').length} open period`} />
              </section>

              <section className="space-y-3">
                {periodCards.map((period) => {
                  const totals = aggregate(period.trips, state.rate);
                  return (
                    <div key={period.id} className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold">{period.name}</h3>
                          <p className="mt-1 text-sm text-white/50">
                            {formatDate(period.startedAt)}
                            {period.endedAt ? ` · ended ${formatDate(period.endedAt)}` : ''}
                          </p>
                        </div>
                        <Badge tone={period.status}>{period.status.toUpperCase()}</Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <StatCard label="Miles" value={totals.miles.toFixed(1)} hint={`${totals.count} trips`} />
                        <StatCard label="Reimbursement" value={formatCurrency(totals.reimbursement)} hint={`Rate ${formatCurrency(state.rate)}/mile`} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        {period.status === 'open' ? (
                          <button
                            type="button"
                            onClick={() => closePeriod(period.id)}
                            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/85 transition-all duration-200 active:scale-[0.98]"
                          >
                            Close period
                          </button>
                        ) : null}
                        {period.status === 'closed' ? (
                          <button
                            type="button"
                            onClick={() => markPaid(period.id)}
                            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-violet-500 px-4 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98]"
                          >
                            Mark paid
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-3">
                        {period.trips.length > 0 ? (
                          [...period.trips].reverse().map((trip) => (
                            <div key={trip.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium text-white">{trip.from || 'Start'} → {trip.to || 'End'}</div>
                                  <div className="mt-1 text-sm text-white/50">
                                    {formatDate(trip.date)} · {trip.startTime || '--:--'} - {trip.endTime || '--:--'}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-semibold text-violet-200">{trip.miles.toFixed(1)} mi</div>
                                  <div className="text-sm text-white/50">{formatCurrency(trip.miles * state.rate)}</div>
                                </div>
                              </div>
                              {trip.notes ? <p className="mt-3 text-sm leading-6 text-white/65">{trip.notes}</p> : null}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/50">
                            No trips in this period yet.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-4">
              <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                <h2 className="text-xl font-semibold">Settings</h2>
                <p className="mt-1 text-sm text-white/50">Data stays on this device through localStorage.</p>

                <div className="mt-4 grid gap-3">
                  <label className="grid gap-2 text-sm text-white/70">
                    Reimbursement rate
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={state.rate}
                      onChange={(event) => setRate(event.target.value)}
                      className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-0 focus:border-violet-400/40"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={exportCsv}
                      className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-violet-500 px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition-all duration-200 active:scale-[0.98]"
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={clearData}
                      className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 px-5 text-sm font-semibold text-rose-200 transition-all duration-200 active:scale-[0.98]"
                    >
                      Clear data
                    </button>
                  </div>
                </div>
              </section>

              <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 text-sm text-white/65 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                <h3 className="text-base font-semibold text-white">PWA mode</h3>
                <ul className="mt-3 space-y-2 leading-6 text-white/60">
                  <li>• Manifest, service worker, and standalone metadata are enabled.</li>
                  <li>• Purple accent, glass cards, and bottom tabs mimic a native iPhone app.</li>
                  <li>• Service worker caches the shell for faster repeat visits.</li>
                </ul>
              </section>
            </div>
          )}
        </main>
      </div>

      {distanceLookupOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 py-4 backdrop-blur-sm sm:items-center">
          <button
            type="button"
            aria-label="Close distance lookup"
            className="absolute inset-0 cursor-default"
            onClick={closeDistanceLookup}
          />
          <div className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0f0b18] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Distance lookup</h2>
                <p className="mt-1 text-sm text-white/55">Look up the distance between two locations and copy it into Miles.</p>
              </div>
              <button
                type="button"
                onClick={closeDistanceLookup}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70 transition-colors hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-2 text-sm text-white/70">
                From
                <input
                  type="text"
                  value={distanceLookup.origin}
                  onChange={(event) =>
                    setDistanceLookup((current) => ({
                      ...current,
                      origin: event.target.value
                    }))
                  }
                  placeholder="123 Main St, Denver"
                  className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-0 placeholder:text-white/25 focus:border-violet-400/40"
                />
              </label>

              <label className="grid gap-2 text-sm text-white/70">
                To
                <input
                  type="text"
                  value={distanceLookup.destination}
                  onChange={(event) =>
                    setDistanceLookup((current) => ({
                      ...current,
                      destination: event.target.value
                    }))
                  }
                  placeholder="456 Market St, Denver"
                  className="min-h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none ring-0 placeholder:text-white/25 focus:border-violet-400/40"
                />
              </label>

              <button
                type="button"
                onClick={runDistanceLookup}
                disabled={distanceLookup.loading}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-violet-500 px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.35)] transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {distanceLookup.loading ? 'Looking up...' : 'Find distance'}
              </button>

              {distanceLookup.error ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {distanceLookup.error}
                </div>
              ) : null}

              {distanceLookup.result ? (
                <div className="rounded-2xl border border-violet-400/15 bg-violet-500/10 p-4 text-sm text-white/70">
                  <div className="text-base font-semibold text-violet-100">
                    {distanceLookup.result.miles.toFixed(1)} miles
                  </div>
                  <div className="mt-1 text-white/55">
                    {distanceLookup.result.origin} → {distanceLookup.result.destination}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/40">
                    {distanceLookup.result.source}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        miles: distanceLookup.result?.miles.toFixed(1) ?? current.miles,
                        from: distanceLookup.origin.trim() || current.from,
                        to: distanceLookup.destination.trim() || current.to
                      }));
                      setDistanceLookupOpen(false);
                    }}
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/85 transition-all duration-200 active:scale-[0.98]"
                  >
                    Use in trip
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <nav className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#05010a]/85 backdrop-blur-2xl safe-pb">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1 px-2 py-2">
          {navItems.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setTab(item.id);
                  haptic();
                }}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[11px] font-medium transition-all duration-200 active:scale-[0.98] ${
                  active
                    ? 'border-violet-400/20 bg-violet-500/15 text-white shadow-[0_0_30px_rgba(168,85,247,0.18)]'
                    : 'border-transparent bg-transparent text-white/55'
                }`}
              >
                <TabIcon name={item.icon} active={active} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

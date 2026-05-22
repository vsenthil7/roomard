/**
 * Guest detail — full profile, preferences, stay history, and "Say this" suggestion.
 * The Say This card is generated on demand via the AI gateway path.
 */
import { useQuery } from '@tanstack/react-query';
import { createRoute, Link } from '@tanstack/react-router';

import { apiFetch } from '../lib/api.js';

import { Route as RootRoute } from './__root.js';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/guests/$id',
  component: GuestDetail,
});

interface GuestProfile {
  id: string;
  display_name: string;
  email?: string;
  phone_e164?: string;
  home_country_code?: string;
  loyalty_tiers: Record<string, string>;
  attention_flags: string[];
}

interface PreferenceItem {
  id: string;
  kind: string;
  polarity: string;
  detail: string;
  confidence: { value: number; calibration: string } | number;
  reinforcement_count: number;
  last_reinforced_at: string;
}

interface HistoryStay {
  id: string;
  property_id: string;
  arrival_at: string;
  departure_at: string;
  status: string;
  room_number: string | null;
}

interface HistoryIssue {
  id: string;
  severity: number;
  title: string;
  occurred_at: string;
  resolved_at: string | null;
}

interface SayThisSuggestion {
  greeting: string;
  context: string;
  preference_callouts: string[];
  model_id: string;
}

function GuestDetail() {
  const { id } = Route.useParams();

  const profile = useQuery({
    queryKey: ['guest', id],
    queryFn: () => apiFetch<GuestProfile>(`/v1/guests/${id}`),
  });

  const prefs = useQuery({
    queryKey: ['guest', id, 'preferences'],
    queryFn: () => apiFetch<{ items: PreferenceItem[] }>(`/v1/guests/${id}/preferences`),
  });

  const history = useQuery({
    queryKey: ['guest', id, 'history'],
    queryFn: () =>
      apiFetch<{ stays: HistoryStay[]; issues: HistoryIssue[] }>(`/v1/guests/${id}/history`),
  });

  const sayThis = useQuery({
    queryKey: ['guest', id, 'say-this'],
    queryFn: () => apiFetch<SayThisSuggestion>(`/v1/guests/${id}/say-this`),
    enabled: false, // explicit user action
    retry: false,
  });

  if (profile.isLoading) return <div role="status">Loading…</div>;
  if (!profile.data) return <div>Guest not found.</div>;

  return (
    <div className="space-y-6">
      <Link to="/guests" className="text-sm text-roomard-700 underline">← Back to guests</Link>
      <header className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{profile.data.display_name}</h1>
          <div className="text-sm text-roomard-700">
            {profile.data.email ?? '—'} · {profile.data.phone_e164 ?? '—'} ·{' '}
            {profile.data.home_country_code ?? '—'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => sayThis.refetch()}
          className="btn-secondary"
          data-testid="say-this-button"
        >
          Generate &ldquo;Say this&rdquo;
        </button>
      </header>

      {sayThis.data && (
        <section className="card border-l-4 border-roomard-500" data-testid="say-this-card">
          <h2 className="text-xs uppercase tracking-wide text-roomard-700">Say this</h2>
          <p className="text-lg italic mt-2">&ldquo;{sayThis.data.greeting}&rdquo;</p>
          <ul className="mt-2 text-sm text-roomard-700 list-disc pl-5">
            {(sayThis.data.preference_callouts ?? []).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <div className="mt-2 text-xs text-roomard-700">Model: {sayThis.data.model_id}</div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">Preferences</h2>
        {prefs.isLoading && <div role="status">Loading preferences…</div>}
        {prefs.data && prefs.data.items.length === 0 && (
          <div className="text-sm text-roomard-700">No preferences recorded yet.</div>
        )}
        {prefs.data && prefs.data.items.length > 0 && (
          <ul className="space-y-2" data-testid="preference-list">
            {prefs.data.items.map((p) => (
              <li key={p.id} className="card flex justify-between items-baseline">
                <div>
                  <span className="font-medium">{p.detail}</span>
                  <span className="ml-2 text-xs uppercase text-roomard-700">
                    {p.kind} · {p.polarity}
                  </span>
                </div>
                <div className="text-xs text-roomard-700">
                  {(((typeof p.confidence === 'number' ? p.confidence : p.confidence?.value) ?? 0) * 100).toFixed(0)}% · reinforced {p.reinforcement_count ?? 0}×
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Recent stays</h2>
        {history.data && history.data.stays.length === 0 && (
          <div className="text-sm text-roomard-700">No prior stays.</div>
        )}
        {history.data && history.data.stays.length > 0 && (
          <ul className="divide-y divide-roomard-100 bg-white rounded-lg shadow">
            {history.data.stays.slice(0, 10).map((s) => (
              <li key={s.id} className="p-3 text-sm">
                {s.arrival_at ? new Date(s.arrival_at).toLocaleDateString() : '—'} →{' '}
                {s.departure_at ? new Date(s.departure_at).toLocaleDateString() : '—'} · Room {s.room_number ?? '—'} ·{' '}
                <span className="text-roomard-700">{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.data && history.data.issues.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Recent issues</h2>
          <ul className="space-y-2">
            {history.data.issues.slice(0, 10).map((i) => (
              <li key={i.id} className="card flex justify-between items-baseline">
                <div>
                  <span className="text-xs font-medium text-red-700">SEV {i.severity}</span>{' '}
                  <span>{i.title}</span>
                </div>
                <div className="text-xs text-roomard-700">
                  {i.occurred_at ? new Date(i.occurred_at).toLocaleDateString() : '—'}{' '}
                  {i.resolved_at ? '· resolved' : '· open'}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Today's brief — UC-01. Front-desk lands here on sign-in.
 * Shows arrivals grouped by priority (VIP > Attention > Standard).
 */
import { useQuery } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { apiFetch } from '../lib/api.js';

import { Route as RootRoute } from './__root.js';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: TodayBrief,
});

interface BriefDetail {
  brief: {
    id: string;
    brief_date: string;
    total_arrivals: number;
    vip_count: number;
    attention_count: number;
    generated_at: string | null;
  };
  items: Array<{
    id: string;
    priority: 'vip' | 'attention' | 'standard';
    display_name: string;
    room_number: string | null;
    arrival_at: string;
    say_this_suggestion: string;
    preference_callouts: string[];
    recent_issues: string[];
  }>;
}

function TodayBrief() {
  const [propertyId, setPropertyId] = useState<string>(
    () => localStorage.getItem('roomard.lastPropertyId') ?? '',
  );

  const propertiesQuery = useQuery({
    queryKey: ['properties'],
    queryFn: () => apiFetch<{ items: Array<{ id: string; name: string }> }>('/v1/properties'),
  });

  const briefQuery = useQuery({
    queryKey: ['brief-today', propertyId],
    queryFn: () => apiFetch<BriefDetail>(`/v1/properties/${propertyId}/briefs/today`),
    enabled: !!propertyId,
    retry: false,
  });

  const onSelectProperty = (id: string): void => {
    setPropertyId(id);
    localStorage.setItem('roomard.lastPropertyId', id);
  };

  if (!propertyId && propertiesQuery.data?.items) {
    const first = propertiesQuery.data.items[0];
    if (first) onSelectProperty(first.id);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Today&apos;s arrivals</h1>
          <p className="text-sm text-roomard-700">Brief generated for the front desk</p>
        </div>
        {propertiesQuery.data && propertiesQuery.data.items.length > 1 && (
          <select
            className="form-input max-w-xs"
            value={propertyId}
            onChange={(e) => onSelectProperty(e.target.value)}
            data-testid="property-selector"
          >
            {propertiesQuery.data.items.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </header>

      {briefQuery.isLoading && <div role="status">Loading brief…</div>}
      {briefQuery.error && (
        <div className="card text-roomard-700">
          No brief for today yet. <button className="underline" onClick={() => briefQuery.refetch()}>Refresh</button>
        </div>
      )}

      {briefQuery.data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total arrivals" value={briefQuery.data.brief.total_arrivals} />
            <Stat label="VIPs" value={briefQuery.data.brief.vip_count} highlight />
            <Stat label="Need attention" value={briefQuery.data.brief.attention_count} />
          </div>
          <ul className="space-y-3" data-testid="brief-items">
            {briefQuery.data.items.map((item) => (
              <li key={item.id} className="card" data-priority={item.priority}>
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{item.display_name}</div>
                    <div className="text-sm text-roomard-700">
                      Room {item.room_number ?? '—'} · Arrives{' '}
                      {new Date(item.arrival_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <PriorityBadge priority={item.priority} />
                </div>
                <p className="mt-3 text-base italic text-roomard-900">&ldquo;{item.say_this_suggestion}&rdquo;</p>
                {item.preference_callouts.length > 0 && (
                  <ul className="mt-2 text-sm text-roomard-700 list-disc pl-5">
                    {item.preference_callouts.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                )}
                {item.recent_issues.length > 0 && (
                  <div className="mt-2 text-xs text-red-700">
                    Recent issues: {item.recent_issues.join(' · ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? 'border-2 border-roomard-500' : ''}`}>
      <div className="text-xs uppercase tracking-wide text-roomard-700">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: 'vip' | 'attention' | 'standard' }) {
  const colours = {
    vip: 'bg-amber-100 text-amber-900',
    attention: 'bg-red-100 text-red-900',
    standard: 'bg-roomard-100 text-roomard-900',
  } as const;
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${colours[priority]}`}>
      {priority}
    </span>
  );
}

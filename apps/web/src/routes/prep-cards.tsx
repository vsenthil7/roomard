/**
 * Housekeeping prep cards — UC-09.
 *
 * Mobile-first surface: housekeeper opens this on their phone, sees one card
 * per arriving room with prep items and the AI warm note, taps to complete.
 *
 * URL: /prep-cards (defaults to "tomorrow's arrivals = today's prep day")
 *      Date and property can be overridden via query string.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { apiFetch } from '../lib/api.js';

import { Route as RootRoute } from './__root.js';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/prep-cards',
  component: PrepCardsView,
});

interface PrepCard {
  id: string;
  stay_id: string;
  guest_id: string;
  display_name: string;
  room_number: string | null;
  arrival_at: string;
  prep_items: string[];
  attention_flags: string[];
  warm_note: string | null;
  status: 'pending' | 'ready' | 'completed' | 'skipped';
  completed_at: string | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function PrepCardsView(): JSX.Element {
  const navigate = useNavigate();
  const [propertyId, setPropertyId] = useState<string>(
    () => localStorage.getItem('roomard.lastPropertyId') ?? '',
  );
  const [prepDate, setPrepDate] = useState<string>(todayIso());
  const queryClient = useQueryClient();

  const propertiesQuery = useQuery({
    queryKey: ['properties'],
    queryFn: () => apiFetch<{ items: Array<{ id: string; name: string }> }>('/v1/properties'),
  });

  // Pick the first property if we don't already have one stored.
  if (!propertyId && propertiesQuery.data?.items) {
    const first = propertiesQuery.data.items[0];
    if (first) {
      setPropertyId(first.id);
      localStorage.setItem('roomard.lastPropertyId', first.id);
    }
  }

  const cardsQuery = useQuery({
    queryKey: ['prep-cards', propertyId, prepDate],
    queryFn: () =>
      apiFetch<{ items: PrepCard[] }>(
        `/v1/properties/${propertyId}/prep-cards/${prepDate}`,
      ),
    enabled: !!propertyId,
  });

  const completeMutation = useMutation({
    mutationFn: async (args: { cardId: string; notes?: string }) =>
      apiFetch<{ ok: true }>(`/v1/prep-cards/${args.cardId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ notes: args.notes }),
        headers: { 'content-type': 'application/json' },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prep-cards', propertyId, prepDate] });
    },
  });

  const cards = cardsQuery.data?.items ?? [];
  const ready = cards.filter((c) => c.status === 'pending' || c.status === 'ready');
  const completed = cards.filter((c) => c.status === 'completed');

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Prep cards</h1>
          <p className="text-sm text-roomard-700">Tap a card to mark complete after room prep</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="form-input"
            value={prepDate}
            onChange={(e) => setPrepDate(e.target.value)}
            data-testid="prep-date"
          />
          {propertiesQuery.data && propertiesQuery.data.items.length > 1 && (
            <select
              className="form-input max-w-xs"
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                localStorage.setItem('roomard.lastPropertyId', e.target.value);
              }}
              data-testid="prep-property"
            >
              {propertiesQuery.data.items.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {cardsQuery.isLoading && <div role="status">Loading prep cards…</div>}
      {cardsQuery.data && cards.length === 0 && (
        <div className="card text-roomard-700">
          No prep cards for {prepDate}. Either no arrivals tomorrow, or generation hasn&rsquo;t run yet.
        </div>
      )}

      {ready.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-roomard-700 mb-2">
            To prep ({ready.length})
          </h2>
          <ul className="space-y-3" data-testid="prep-cards-ready">
            {ready.map((c) => (
              <PrepCardItem
                key={c.id}
                card={c}
                onComplete={(notes) =>
                  completeMutation.mutate({ cardId: c.id, notes })
                }
                onViewGuest={() => void navigate({ to: '/guests/$id', params: { id: c.guest_id } })}
                disabled={completeMutation.isPending}
              />
            ))}
          </ul>
        </section>
      )}

      {completed.length > 0 && (
        <section className="opacity-60">
          <h2 className="text-sm uppercase tracking-wide text-roomard-700 mb-2">
            Completed ({completed.length})
          </h2>
          <ul className="space-y-2" data-testid="prep-cards-completed">
            {completed.map((c) => (
              <li key={c.id} className="card flex justify-between items-baseline">
                <div>
                  <div className="font-medium line-through">{c.display_name}</div>
                  <div className="text-xs text-roomard-700">
                    Room {c.room_number ?? '—'} · Completed{' '}
                    {c.completed_at
                      ? new Date(c.completed_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </div>
                </div>
                <span className="text-xs bg-green-100 text-green-900 rounded px-2 py-1">✓</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PrepCardItem({
  card,
  onComplete,
  onViewGuest,
  disabled,
}: {
  card: PrepCard;
  onComplete: (notes?: string) => void;
  onViewGuest: () => void;
  disabled: boolean;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');

  return (
    <li className="card" data-testid="prep-card-item">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{card.display_name}</div>
          <div className="text-sm text-roomard-700">
            Room {card.room_number ?? '—'} · Arrives{' '}
            {card.arrival_at
              ? new Date(card.arrival_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </div>
        </div>
        {(card.attention_flags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(card.attention_flags ?? []).map((f) => (
              <span
                key={f}
                className="text-xs uppercase tracking-wide bg-amber-100 text-amber-900 rounded px-2 py-1"
              >
                {f.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {card.warm_note && (
        <p className="mt-3 text-base italic text-roomard-900">&ldquo;{card.warm_note}&rdquo;</p>
      )}

      {(card.prep_items ?? []).length > 0 && (
        <ul className="mt-3 space-y-1" data-testid="prep-items">
          {(card.prep_items ?? []).map((item, idx) => (
            <li
              key={idx}
              className="text-sm text-roomard-900 before:content-['•'] before:mr-2 before:text-roomard-500"
            >
              {item}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            if (expanded) {
              onComplete(notes || undefined);
            } else {
              setExpanded(true);
            }
          }}
          disabled={disabled}
          data-testid="prep-complete-btn"
        >
          {expanded ? 'Confirm complete' : 'Mark complete'}
        </button>
        <button type="button" className="btn-secondary" onClick={onViewGuest}>
          View guest
        </button>
        {expanded && (
          <button
            type="button"
            className="text-sm text-roomard-700 underline"
            onClick={() => setExpanded(false)}
          >
            Cancel
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2">
          <label className="text-xs text-roomard-700" htmlFor={`notes-${card.id}`}>
            Optional notes (e.g. &ldquo;extra towels delivered&rdquo;)
          </label>
          <textarea
            id={`notes-${card.id}`}
            className="form-input w-full mt-1"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="prep-notes"
          />
        </div>
      )}
    </li>
  );
}

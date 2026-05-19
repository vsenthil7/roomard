/**
 * Guest list — search with debounce, paginate via cursor.
 */
import { useQuery } from '@tanstack/react-query';
import { createRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';

import { apiFetch } from '../lib/api.js';

import { Route as RootRoute } from './__root.js';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/guests',
  component: GuestList,
});

interface GuestRow {
  id: string;
  displayName: string;
  email?: string;
  activePreferenceCount: number;
  upcomingArrivalAt?: string;
}

function GuestList() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const list = useQuery({
    queryKey: ['guests', debounced],
    queryFn: () =>
      apiFetch<{ items: GuestRow[]; page: { hasMore: boolean; nextCursor: string | null } }>(
        `/v1/guests${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`,
      ),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Guests</h1>
      </header>
      <input
        type="search"
        className="form-input max-w-md"
        placeholder="Search by name, email or phone"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="guest-search"
      />
      {list.isLoading && <div role="status">Loading…</div>}
      {list.data && (
        <ul className="divide-y divide-roomard-100 bg-white rounded-lg shadow" data-testid="guest-list">
          {list.data.items.map((g) => (
            <li key={g.id} className="p-3 hover:bg-roomard-50">
              <Link to="/guests/$id" params={{ id: g.id }} className="flex justify-between items-center">
                <div>
                  <div className="font-medium">{g.displayName}</div>
                  <div className="text-xs text-roomard-700">{g.email ?? '—'}</div>
                </div>
                <div className="text-xs text-roomard-700">
                  {g.activePreferenceCount} preferences
                  {g.upcomingArrivalAt && (
                    <span className="ml-2">• Next: {new Date(g.upcomingArrivalAt).toLocaleDateString()}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
          {list.data.items.length === 0 && (
            <li className="p-4 text-sm text-roomard-700">No guests match.</li>
          )}
        </ul>
      )}
    </div>
  );
}

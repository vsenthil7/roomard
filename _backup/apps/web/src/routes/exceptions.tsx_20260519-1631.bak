/**
 * Exception queue — review/resolve items that need human attention.
 * GM and Front Desk Manager surfaces.
 */
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../lib/api.js';

export const Route = createFileRoute('/exceptions')({
  component: Exceptions,
});

interface ExceptionItem {
  id: string;
  kind: string;
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed';
  severity: number;
  title: string;
  description: string;
  created_at: string;
}

function Exceptions() {
  const [status, setStatus] = useState<'open' | 'in_progress' | 'resolved'>('open');
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['exceptions', status],
    queryFn: () =>
      apiFetch<{ items: ExceptionItem[] }>(`/v1/exceptions?status=${status}&limit=100`),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'resolved' | 'dismissed' }) =>
      apiFetch(`/v1/exceptions/${id}`, {
        method: 'PATCH',
        body: { status: action, resolutionNotes: action === 'resolved' ? 'Resolved via web UI' : 'Dismissed' },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exceptions'] });
    },
  });

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exceptions</h1>
          <p className="text-sm text-roomard-700">Items that need human review</p>
        </div>
        <div className="flex gap-2 text-sm" role="tablist">
          {(['open', 'in_progress', 'resolved'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              className={status === s ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setStatus(s)}
              data-testid={`tab-${s}`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </header>

      {list.isLoading && <div role="status">Loading…</div>}
      {list.data && list.data.items.length === 0 && (
        <div className="card text-sm text-roomard-700">No exceptions in this state.</div>
      )}
      {list.data && (
        <ul className="space-y-3" data-testid="exception-list">
          {list.data.items.map((e) => (
            <li key={e.id} className="card flex justify-between items-start gap-4" data-severity={e.severity}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase text-red-700">SEV {e.severity}</span>
                  <span className="text-xs text-roomard-700">{e.kind}</span>
                </div>
                <div className="font-medium mt-1">{e.title}</div>
                <p className="text-sm text-roomard-700 mt-1">{e.description}</p>
                <div className="text-xs text-roomard-700 mt-1">
                  Created {new Date(e.created_at).toLocaleString()}
                </div>
              </div>
              {(status === 'open' || status === 'in_progress') && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => resolveMutation.mutate({ id: e.id, action: 'resolved' })}
                    data-testid={`resolve-${e.id}`}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => resolveMutation.mutate({ id: e.id, action: 'dismissed' })}
                    data-testid={`dismiss-${e.id}`}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

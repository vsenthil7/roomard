/**
 * New capture — the magic-moment flow.
 *
 * Path A (online): file picker → POST /v1/captures multipart → result shown
 * Path B (offline): same form, but on failure the capture is queued in IndexedDB.
 *
 * Camera uses native <input type="file" accept="image/*" capture="environment">,
 * which on mobile opens the rear camera. Desktop falls back to a regular picker.
 */
import { useQuery } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { apiFetch, ApiError } from '../lib/api.js';
import { enqueueCapture } from '../lib/offline-queue.js';
import { useAuthStore } from '../stores/auth.js';

import { Route as RootRoute } from './__root.js';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/captures/new',
  component: CaptureNew,
});

interface CaptureForm {
  propertyId: string;
  guestId?: string;
  notes?: string;
}

interface CaptureResponse {
  evidence_id: string;
  status: 'accepted' | 'pending_review';
  confidence: { value: number };
  extracted_preferences: Array<{ kind: string; polarity: string; detail: string; confidence: number }>;
  exception_queue_item_id?: string;
}

function CaptureNew() {
  const navigate = useNavigate();
  const principal = useAuthStore((s) => s.principal);
  const properties = useQuery({
    queryKey: ['properties'],
    queryFn: () => apiFetch<{ items: Array<{ id: string; name: string }> }>('/v1/properties'),
  });
  const guests = useQuery({
    queryKey: ['guests-min'],
    queryFn: () => apiFetch<{ items: Array<{ id: string; display_name: string }> }>('/v1/guests'),
  });

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CaptureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  // Preview the chosen card image so the agent can confirm it's legible before
  // uploading. Object URL is revoked when the file changes or the component
  // unmounts to avoid leaking blob URLs.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const { register, handleSubmit } = useForm<CaptureForm>({
    defaultValues: { propertyId: localStorage.getItem('roomard.lastPropertyId') ?? '' },
  });

  const onSubmit = async (values: CaptureForm): Promise<void> => {
    setError(null);
    setResult(null);
    setQueued(false);
    if (!file) {
      setError('Please attach a photo first.');
      return;
    }
    const fd = new FormData();
    fd.append('file', file, file.name || 'capture.jpg');
    fd.append('property_id', values.propertyId);
    if (values.guestId) fd.append('guest_id', values.guestId);
    if (values.notes) fd.append('notes', values.notes);
    fd.append('captured_at', new Date().toISOString());
    fd.append('capture_surface', 'mobile_camera');

    try {
      const res = await apiFetch<CaptureResponse>('/v1/captures', { method: 'POST', body: fd });
      setResult(res);
    } catch (err) {
      // If we're offline or got a 5xx, queue it for replay.
      if (!navigator.onLine || (err instanceof ApiError && err.status >= 500)) {
        await enqueueCapture({
          tenantId: principal?.tenantId ?? '',
          propertyId: values.propertyId,
          guestId: values.guestId,
          file,
          contentType: file.type || 'image/jpeg',
          capturedAt: new Date().toISOString(),
          notes: values.notes,
        });
        setQueued(true);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Capture failed.');
      }
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">New capture</h1>
        <p className="text-sm text-roomard-700">
          Take a photo of a comment card, room-service slip, or note. We&apos;ll extract
          preferences and save them to the guest profile.
        </p>
      </header>

      {error && <div role="alert" className="text-sm text-red-700">{error}</div>}
      {queued && (
        <div role="status" className="card border-l-4 border-amber-500" data-testid="queued-banner">
          You appear to be offline. The capture has been saved locally and will upload automatically
          once you reconnect.
        </div>
      )}

      {result && (
        <div className="card border-l-4 border-roomard-500" data-testid="capture-result">
          <h2 className="font-semibold">
            {result.status === 'accepted'
              ? '✓ Capture accepted'
              : '◇ Saved — needs review'}
          </h2>
          <p className="text-sm text-roomard-700 mt-1">
            Confidence: {((result.confidence?.value ?? 0) * 100).toFixed(0)}%
          </p>
          {(result.extracted_preferences ?? []).length > 0 && (
            <ul className="mt-2 text-sm list-disc pl-5">
              {(result.extracted_preferences ?? []).map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.detail}</span>{' '}
                  <span className="text-roomard-700">
                    ({p.kind} · {p.polarity}, {(p.confidence * 100).toFixed(0)}%)
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.exception_queue_item_id && (
            <p className="text-xs text-roomard-700 mt-2">
              Queued to exception list for manual review.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setResult(null);
                setFile(null);
              }}
            >
              Another capture
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate({ to: '/' })}
            >
              Back to brief
            </button>
          </div>
        </div>
      )}

      {!result && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" aria-label="capture form">
          <div>
            <label className="form-label" htmlFor="property">Property</label>
            <select id="property" className="form-input" {...register('propertyId', { required: true })} data-testid="capture-property">
              <option value="">Select property…</option>
              {properties.data?.items.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="guest">Linked guest (optional)</label>
            <select id="guest" className="form-input" {...register('guestId')} data-testid="capture-guest">
              <option value="">— not linked —</option>
              {guests.data?.items.map((g) => (
                <option key={g.id} value={g.id}>{g.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="notes">Notes</label>
            <textarea id="notes" rows={2} className="form-input" {...register('notes')} data-testid="capture-notes" />
          </div>
          <div>
            <label className="form-label" htmlFor="file">Photo</label>
            <input
              id="file"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
              data-testid="capture-file"
            />
            {file && <div className="text-xs text-roomard-700 mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
            {previewUrl && (
              <div className="mt-2" data-testid="capture-preview">
                <img
                  src={previewUrl}
                  alt="Selected check-in card"
                  className="max-h-64 rounded border border-roomard-200 object-contain"
                />
              </div>
            )}
          </div>
          <button type="submit" className="btn-primary w-full" data-testid="capture-submit" disabled={!file}>
            Upload capture
          </button>
        </form>
      )}
    </div>
  );
}

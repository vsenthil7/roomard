/**
 * Onboarding — the "new hotel starts from zero" setup wizard.
 *
 * A brand-new tenant has an empty system: no property, no guests, no brief.
 * This screen walks the operator through the first three real data-entry steps,
 * each backed by a live API:
 *
 *   Step 1 — Create the property        POST /v1/properties
 *   Step 2 — Add the first guests        POST /v1/guests   (one row each)
 *   Step 3 — Generate the first brief    POST /v1/briefs/generate
 *
 * After step 3 the rest of the product (brief, prep cards, capture, exceptions)
 * has real data to show. This is the operational "how does a hotel start using
 * it" path — not a seed script, the actual UI a new customer would use.
 */
import { useQuery } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { apiFetch, ApiError } from '../lib/api.js';

import { Route as RootRoute } from './__root.js';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/onboarding',
  component: Onboarding,
});

interface Property {
  id: string;
  name: string;
  short_code: string;
}
interface GuestDraft {
  displayName: string;
  email: string;
  homeCountryCode: string;
  note: string;
}

const BLANK_GUEST: GuestDraft = { displayName: '', email: '', homeCountryCode: 'GB', note: '' };

function Onboarding() {
  const navigate = useNavigate();

  // Which properties already exist (so a returning operator sees the system isn't empty).
  const properties = useQuery({
    queryKey: ['properties'],
    queryFn: () => apiFetch<{ items: Property[] }>('/v1/properties'),
  });

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — property form
  const [propName, setPropName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [city, setCity] = useState('');
  const [createdProperty, setCreatedProperty] = useState<Property | null>(null);

  // Step 2 — guests
  const [guests, setGuests] = useState<GuestDraft[]>([{ ...BLANK_GUEST }]);
  const [createdGuestIds, setCreatedGuestIds] = useState<string[]>([]);

  // Step 3 — brief
  const [briefSummary, setBriefSummary] = useState<{ totalArrivals: number; status: string } | null>(null);

  const createProperty = async (): Promise<void> => {
    setError(null);
    if (!propName.trim() || !shortCode.trim()) {
      setError('Property name and short code are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<Property>('/v1/properties', {
        method: 'POST',
        body: {
          name: propName.trim(),
          shortCode: shortCode.trim().toUpperCase(),
          timezone: 'Europe/London',
          locale: 'en-GB',
          addressJson: city.trim() ? { city: city.trim(), countryCode: 'GB' } : undefined,
        },
      });
      setCreatedProperty(res);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the property.');
    } finally {
      setBusy(false);
    }
  };

  const addGuestRow = (): void => setGuests((g) => [...g, { ...BLANK_GUEST }]);
  const updateGuest = (i: number, patch: Partial<GuestDraft>): void =>
    setGuests((g) => g.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeGuest = (i: number): void => setGuests((g) => g.filter((_, idx) => idx !== i));

  const saveGuests = async (): Promise<void> => {
    setError(null);
    const valid = guests.filter((g) => g.displayName.trim());
    if (valid.length === 0) {
      setError('Add at least one guest (a name is enough).');
      return;
    }
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const g of valid) {
        const res = await apiFetch<{ id: string }>('/v1/guests', {
          method: 'POST',
          body: {
            displayName: g.displayName.trim(),
            email: g.email.trim() || undefined,
            homeCountryCode: g.homeCountryCode || undefined,
          },
        });
        ids.push(res.id);
      }
      setCreatedGuestIds(ids);
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the guests.');
    } finally {
      setBusy(false);
    }
  };

  const generateBrief = async (): Promise<void> => {
    setError(null);
    if (!createdProperty) {
      setError('Create the property first.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ totalArrivals: number; status: string }>('/v1/briefs/generate', {
        method: 'POST',
        body: { propertyId: createdProperty.id, force: true },
      });
      setBriefSummary({ totalArrivals: res.totalArrivals, status: res.status });
      setStep(4);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the brief.');
    } finally {
      setBusy(false);
    }
  };

  const stepLabels = ['Create property', 'Add first guests', 'Generate brief', 'Ready'];

  return (
    <div className="max-w-2xl space-y-6" data-testid="onboarding">
      <header>
        <h1 className="text-2xl font-bold">Set up your hotel</h1>
        <p className="text-sm text-roomard-700">
          A new Roomard workspace starts empty. These three steps put your first data in —
          after that, the daily brief, prep cards and guest profiles fill themselves.
        </p>
      </header>

      {/* Step indicator */}
      <ol className="flex items-center gap-2 text-xs" data-testid="onboarding-steps">
        {stepLabels.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          const state = step > n ? 'done' : step === n ? 'current' : 'todo';
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={
                  'inline-flex h-6 w-6 items-center justify-center rounded-full font-semibold ' +
                  (state === 'done'
                    ? 'bg-roomard-500 text-white'
                    : state === 'current'
                      ? 'bg-roomard-100 text-roomard-700 ring-2 ring-roomard-500'
                      : 'bg-roomard-50 text-roomard-700')
                }
              >
                {state === 'done' ? '✓' : n}
              </span>
              <span className={state === 'current' ? 'font-medium' : 'text-roomard-700'}>{label}</span>
              {i < stepLabels.length - 1 && <span className="text-roomard-100">—</span>}
            </li>
          );
        })}
      </ol>

      {error && <div role="alert" className="text-sm text-red-700">{error}</div>}

      {/* STEP 1 — property */}
      {step === 1 && (
        <section className="card space-y-4" data-testid="step-property">
          <h2 className="font-semibold">Step 1 · Create your property</h2>
          <p className="text-sm text-roomard-700">
            This is the hotel guests will arrive at. You can add more properties later.
          </p>
          <div>
            <label className="form-label" htmlFor="prop-name">Property name</label>
            <input id="prop-name" className="form-input" value={propName}
              onChange={(e) => setPropName(e.target.value)} placeholder="The Riverside Hotel"
              data-testid="prop-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label" htmlFor="prop-code">Short code</label>
              <input id="prop-code" className="form-input" value={shortCode}
                onChange={(e) => setShortCode(e.target.value)} placeholder="RVS"
                data-testid="prop-code" />
            </div>
            <div>
              <label className="form-label" htmlFor="prop-city">City</label>
              <input id="prop-city" className="form-input" value={city}
                onChange={(e) => setCity(e.target.value)} placeholder="London"
                data-testid="prop-city" />
            </div>
          </div>
          <button type="button" className="btn-primary" disabled={busy}
            onClick={() => void createProperty()} data-testid="create-property">
            {busy ? 'Creating…' : 'Create property →'}
          </button>
          {properties.data && properties.data.items.length > 0 && (
            <p className="text-xs text-roomard-700">
              {properties.data.items.length} propert{properties.data.items.length === 1 ? 'y' : 'ies'} already in this workspace.
            </p>
          )}
        </section>
      )}

      {/* STEP 2 — guests */}
      {step === 2 && (
        <section className="card space-y-4" data-testid="step-guests">
          <h2 className="font-semibold">
            Step 2 · Add your first guests
            {createdProperty && <span className="text-roomard-700 font-normal"> · {createdProperty.name}</span>}
          </h2>
          <p className="text-sm text-roomard-700">
            Add the guests arriving soon. A name is enough to start — preferences build up
            automatically from captures and stays.
          </p>
          <div className="space-y-3">
            {guests.map((g, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end" data-testid="guest-row">
                <div className="col-span-5">
                  <label className="form-label">Name</label>
                  <input className="form-input" value={g.displayName}
                    onChange={(e) => updateGuest(i, { displayName: e.target.value })}
                    placeholder="Dr. Rashida Ali" data-testid="guest-name" />
                </div>
                <div className="col-span-5">
                  <label className="form-label">Email (optional)</label>
                  <input className="form-input" value={g.email}
                    onChange={(e) => updateGuest(i, { email: e.target.value })}
                    placeholder="r.ali@example.com" />
                </div>
                <div className="col-span-2">
                  {guests.length > 1 && (
                    <button type="button" className="btn-secondary w-full"
                      onClick={() => removeGuest(i)} aria-label="Remove guest">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={addGuestRow}
              data-testid="add-guest">+ Add another</button>
            <button type="button" className="btn-primary" disabled={busy}
              onClick={() => void saveGuests()} data-testid="save-guests">
              {busy ? 'Saving…' : 'Save guests →'}
            </button>
          </div>
        </section>
      )}

      {/* STEP 3 — brief */}
      {step === 3 && (
        <section className="card space-y-4" data-testid="step-brief">
          <h2 className="font-semibold">Step 3 · Generate today's brief</h2>
          <p className="text-sm text-roomard-700">
            {createdGuestIds.length} guest{createdGuestIds.length === 1 ? '' : 's'} added.
            Generate the first daily arrival brief — Roomard ranks arrivals and drafts what
            to say to each guest.
          </p>
          <button type="button" className="btn-primary" disabled={busy}
            onClick={() => void generateBrief()} data-testid="generate-brief">
            {busy ? 'Generating…' : 'Generate brief →'}
          </button>
        </section>
      )}

      {/* STEP 4 — done */}
      {step === 4 && (
        <section className="card space-y-4 border-l-4 border-roomard-500" data-testid="step-done">
          <h2 className="font-semibold">✓ Your hotel is live on Roomard</h2>
          <ul className="text-sm list-disc pl-5 space-y-1">
            <li>Property created: <span className="font-medium">{createdProperty?.name}</span></li>
            <li>{createdGuestIds.length} guest{createdGuestIds.length === 1 ? '' : 's'} added</li>
            <li>
              First brief generated — status <span className="font-medium">{briefSummary?.status}</span>,
              {' '}{briefSummary?.totalArrivals ?? 0} arrival{briefSummary?.totalArrivals === 1 ? '' : 's'}
            </li>
          </ul>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => navigate({ to: '/' })}
              data-testid="go-to-brief">Go to the daily brief →</button>
            <button type="button" className="btn-secondary" onClick={() => navigate({ to: '/captures/new' })}>
              Capture a check-in card
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

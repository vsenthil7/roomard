/**
 * RBAC denial — front-desk agent should not be able to hit audit endpoints.
 * Verified at the API level (UI doesn't expose admin routes by default).
 */
import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:3000';

test.describe('RBAC denial', () => {
  test('agent role cannot read audit events', async ({ request }) => {
    // Sign in as the agent role via the API directly
    const loginRes = await request.post(`${API_BASE}/v1/auth/password/login`, {
      data: {
        email: process.env.E2E_AGENT_EMAIL ?? 'front_desk_agent@demo.local',
        password: process.env.E2E_AGENT_PASSWORD ?? 'Roomard123!',
        tenant_slug: process.env.E2E_DEMO_TENANT ?? 'demo',
      },
    });
    if (!loginRes.ok()) test.skip(true, 'agent seed not present');
    const body = await loginRes.json();
    const accessToken = body.tokens?.access_token;
    if (!accessToken) test.skip(true, 'no access token in login response');

    const auditRes = await request.get(`${API_BASE}/v1/audit/events`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect([401, 403]).toContain(auditRes.status());
  });
});

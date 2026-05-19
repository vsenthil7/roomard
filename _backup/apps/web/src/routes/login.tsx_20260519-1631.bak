/**
 * Login route. Email + password, then MFA challenge if required.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../stores/auth.js';
import { apiFetch, ApiError } from '../lib/api.js';

interface LoginForm {
  email: string;
  password: string;
  tenantSlug: string;
}

interface MfaForm {
  code: string;
}

export const Route = createFileRoute('/login')({
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const { setTokens, setPrincipal } = useAuthStore();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loginForm = useForm<LoginForm>({ defaultValues: { tenantSlug: 'demo' } });
  const mfaForm = useForm<MfaForm>();

  const onLogin = async (values: LoginForm): Promise<void> => {
    setError(null);
    try {
      const res = await apiFetch<{
        status: 'success' | 'mfa_required';
        mfa_token?: string;
        tokens?: { access_token: string; refresh_token: string };
        principal?: import('../stores/auth.js').Principal;
      }>('/v1/auth/password/login', {
        method: 'POST',
        body: { email: values.email, password: values.password, tenant_slug: values.tenantSlug },
        skipAuth: true,
      });
      if (res.status === 'mfa_required' && res.mfa_token) {
        setMfaToken(res.mfa_token);
      } else if (res.status === 'success' && res.tokens && res.principal) {
        setTokens(res.tokens.access_token, res.tokens.refresh_token);
        setPrincipal(res.principal);
        navigate({ to: '/' });
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Login failed');
    }
  };

  const onMfa = async (values: MfaForm): Promise<void> => {
    if (!mfaToken) return;
    setError(null);
    try {
      const res = await apiFetch<{
        tokens: { access_token: string; refresh_token: string };
        principal: import('../stores/auth.js').Principal;
      }>('/v1/auth/mfa/verify', {
        method: 'POST',
        body: { mfa_token: mfaToken, code: values.code },
        skipAuth: true,
      });
      setTokens(res.tokens.access_token, res.tokens.refresh_token);
      setPrincipal(res.principal);
      navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('MFA verification failed');
    }
  };

  return (
    <div className="min-h-screen bg-roomard-500 flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-roomard-900 mb-1">Sign in to Roomard</h1>
        <p className="text-sm text-roomard-700 mb-6">AI guest memory engine</p>
        {error && <div role="alert" className="mb-4 text-sm text-red-700">{error}</div>}
        {!mfaToken ? (
          <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4" aria-label="login form">
            <div>
              <label className="form-label" htmlFor="tenantSlug">Property group</label>
              <input
                id="tenantSlug"
                className="form-input"
                {...loginForm.register('tenantSlug', { required: true })}
                data-testid="tenant-slug"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="form-input"
                {...loginForm.register('email', { required: true })}
                data-testid="email"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="form-input"
                {...loginForm.register('password', { required: true })}
                data-testid="password"
              />
            </div>
            <button type="submit" className="btn-primary w-full" data-testid="signin">
              Sign in
            </button>
          </form>
        ) : (
          <form onSubmit={mfaForm.handleSubmit(onMfa)} className="space-y-4" aria-label="mfa form">
            <p className="text-sm text-roomard-700">Enter the six-digit code from your authenticator app.</p>
            <div>
              <label className="form-label" htmlFor="code">Authenticator code</label>
              <input
                id="code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="form-input"
                {...mfaForm.register('code', { required: true })}
                data-testid="mfa-code"
              />
            </div>
            <button type="submit" className="btn-primary w-full" data-testid="verify-mfa">
              Verify
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

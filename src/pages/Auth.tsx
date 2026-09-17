import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import { api } from '../services/api';
import { Field, ErrorBox } from '../components/UI';
export default function Auth() {
  const location = useLocation(),
    [params] = useSearchParams(),
    navigate = useNavigate();
  const { login } = useStore();
  const mode = location.pathname;
  const register = mode === '/register',
    forgot = mode === '/forgot-password',
    reset = mode === '/reset-password',
    verify = mode === '/verify-email';
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const fd = new FormData(e.currentTarget);
    try {
      if (verify || reset) {
        const r = await api(verify ? '/auth/verify' : '/auth/reset', {
          method: 'POST',
          body: { token: params.get('token'), ...(reset ? { password: fd.get('password') } : {}) },
        });
        setMessage(r.message);
      } else if (forgot) {
        setMessage((await api('/auth/forgot', { method: 'POST', body: { email: fd.get('email') } })).message);
      } else if (register) {
        setMessage(
          (
            await api('/auth/register', {
              method: 'POST',
              body: {
                name: fd.get('name'),
                email: fd.get('email'),
                phone: fd.get('phone'),
                password: fd.get('password'),
              },
            })
          ).message,
        );
      } else {
        const user = await login({
          email: fd.get('email'),
          password: fd.get('password'),
          remember: fd.get('remember') === 'on',
        });
        const next = params.get('next');
        navigate(
          ['admin', 'super_admin'].includes(user.role)
            ? '/admin'
            : next?.startsWith('/') && !next.startsWith('//')
              ? next
              : '/account',
        );
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const title = register
    ? 'A little more you.'
    : forgot
      ? 'Let’s get you back in.'
      : reset
        ? 'A fresh start.'
        : verify
          ? 'One last step.'
          : 'Good to see you again.';
  return (
    <section className="auth-page container">
      <div className="auth-art">
        <img src="/hero.jpg" alt="A trio of sculptural ceramic vases" />
        <div>
          <span className="eyebrow">WELCOME TO OKPORA</span>
          <h2>
            Good things
            <br />
            start here.
          </h2>
        </div>
      </div>
      <div className="auth-form">
        <span className="eyebrow">YOUR OKPORA ACCOUNT</span>
        <h1>{title}</h1>
        <p className="muted">
          {register
            ? 'Keep your favourites, follow your orders and make yourself at home.'
            : verify
              ? 'Confirm your email address to activate your account.'
              : forgot
                ? 'We’ll email you a secure link to reset your password.'
                : reset
                  ? 'Choose a password with at least 12 characters.'
                  : 'Your favourites and everyday essentials are waiting.'}
        </p>
        {error && <ErrorBox message={error} />}{' '}
        {message ? (
          <div className="success-box">
            {message}
            <p>
              <Link to="/login">Back to sign in</Link>
            </p>
          </div>
        ) : (
          <form key={mode} onSubmit={submit}>
            {register && (
              <Field label="Your name">
                <input name="name" autoComplete="name" minLength={2} required />
              </Field>
            )}
            {!reset && !verify && (
              <Field label="Email address">
                <input name="email" type="email" autoComplete="email" required />
              </Field>
            )}
            {register && (
              <Field label="Phone number (optional)">
                <input name="phone" type="tel" autoComplete="tel" />
              </Field>
            )}
            {!forgot && !verify && (
              <Field label="Password">
                <input
                  name="password"
                  type="password"
                  autoComplete={register || reset ? 'new-password' : 'current-password'}
                  minLength={register || reset ? 12 : 1}
                  maxLength={128}
                  required
                />
              </Field>
            )}
            {!register && !forgot && !reset && !verify && (
              <div className="between">
                <label className="check">
                  <input type="checkbox" name="remember" />
                  Remember me
                </label>
                <Link to="/forgot-password">Forgot password?</Link>
              </div>
            )}
            <button className="button full" disabled={busy}>
              {busy
                ? 'Please wait…'
                : register
                  ? 'Create account'
                  : forgot
                    ? 'Send reset link'
                    : reset
                      ? 'Update password'
                      : verify
                        ? 'Confirm my email'
                        : 'Sign in'}
            </button>
          </form>
        )}
        {!register && !forgot && !reset && !verify && (
          <>
            <p className="auth-alternate">
              New around here? <Link to="/register">Create an account</Link>
            </p>
            <form
              className="verification-resend"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                try {
                  setMessage(
                    (
                      await api('/auth/resend-verification', {
                        method: 'POST',
                        body: { email: fd.get('email') },
                      })
                    ).message,
                  );
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              <details>
                <summary>Need a new verification email?</summary>
                <Field label="Email">
                  <input type="email" name="email" required />
                </Field>
                <button className="text-button">Resend link</button>
              </details>
            </form>
          </>
        )}
        {register && (
          <p className="auth-alternate">
            Already at home here? <Link to="/login">Sign in</Link>
          </p>
        )}
      </div>
    </section>
  );
}

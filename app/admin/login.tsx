'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signIn } from './actions';
import { BlurIn, MorphButton, type Busy } from './motion';

/** The owner's door: one password, and the button becomes the answer. */
export function Login() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [state, setState] = useState<Busy>('idle');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw || state === 'busy') return;
    setState('busy'); setError('');
    const res = await signIn(pw).catch(() => ({ ok: false, error: 'The server did not answer.' }));
    if (res.ok) {
      setState('done');
      setTimeout(() => router.refresh(), 700);
    } else {
      setState('error'); setError(res.error ?? 'That did not work.'); setPw('');
      setTimeout(() => setState('idle'), 450);
    }
  }

  return (
    <div className="adm adm-login">
      <form className="login" onSubmit={submit}>
        <p className="adm-mark">GameMog<span>Admin</span></p>
        <h1>Owner sign in</h1>
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        <MorphButton type="submit" state={state}>Sign in</MorphButton>
        <BlurIn k={error} className="login-e">{error && <p role="alert">{error}</p>}</BlurIn>
      </form>
    </div>
  );
}

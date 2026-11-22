import { useState } from 'react'
import { api } from './api'

export default function Auth({ onAuth }) {
  const resetToken = new URLSearchParams(location.search).get('reset') || ''
  const [mode, setMode] = useState(resetToken ? 'reset' : 'in'), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(''), [pending, setPending] = useState(null)
  const [f, setF] = useState({ name: '', business: '', email: '', phone: '', password: '', confirm: '' })
  const u = k => e => setF({ ...f, [k]: e.target.value }), up = mode === 'up'
  const submit = async e => {
    e.preventDefault(); setErr(''); setNotice('')
    if (mode !== 'reset' && !/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Enter a valid email address')
    if (mode === 'forgot') {
      setBusy(true)
      try { const r = await api('/password/forgot', 'POST', { email: f.email }); setNotice(r.message) } catch (x) { setErr(x.message) }
      setBusy(false); return
    }
    if (f.password.length < 6) return setErr('Password must be at least 6 characters')
    if (mode === 'reset' && f.password !== f.confirm) return setErr('Passwords do not match')
    if (up && (!f.name.trim() || !f.business.trim())) return setErr('Enter your name and business name')
    if (up && f.password !== f.confirm) return setErr('Passwords do not match')
    setBusy(true)
    try {
      if (mode === 'reset') { await api('/password/reset', 'POST', { token: resetToken, password: f.password }); history.replaceState({}, '', '/'); setNotice('Your password has been updated. You can now sign in.'); setMode('in') }
      else { const r = await api(up ? '/signup' : '/login', 'POST', f); setPending({ user: r.user, token: r.token, emailSent: r.emailSent }); setNotice(up ? 'Your account is ready.' : 'You’re signed in securely.') }
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  const title = mode === 'forgot' ? 'Recover your password' : mode === 'reset' ? 'Choose a new password' : up ? 'Create your account' : 'Welcome back'
  return (
    <div className="auth"><form className="authcard" onSubmit={submit}>
      <div className="brand" style={{ padding: 0 }}><i>L</i>Ledgerline</div>
      <h1>{title}</h1>
      <p className="lead">{mode === 'forgot' ? 'We’ll email you a secure, one hour reset link.' : mode === 'reset' ? 'Use a strong password you haven’t used elsewhere.' : up ? 'Set up your business to start billing.' : 'Sign in to manage invoices and stock.'}</p>
      {['in', 'up'].includes(mode) && <div className="tabs"><button type="button" className={!up ? 'on' : ''} onClick={() => { setMode('in'); setErr(''); setNotice('') }}>Sign in</button><button type="button" className={up ? 'on' : ''} onClick={() => { setMode('up'); setErr(''); setNotice('') }}>Sign up</button></div>}
      {up && <><label>Full name</label><input value={f.name} onChange={u('name')} autoComplete="name" required />
        <label>Business name</label><input value={f.business} onChange={u('business')} required />
        <label>Phone number</label><input value={f.phone} onChange={u('phone')} autoComplete="tel" /></>}
      {mode !== 'reset' && <><label>Email</label><input type="email" value={f.email} onChange={u('email')} autoComplete="email" required /></>}
      {mode !== 'forgot' && <><label>{mode === 'reset' ? 'New password' : 'Password'}</label><input type="password" value={f.password} onChange={u('password')} autoComplete={up || mode === 'reset' ? 'new-password' : 'current-password'} required />
      {(up || mode === 'reset') && <><label>Confirm password</label><input type="password" value={f.confirm} onChange={u('confirm')} autoComplete="new-password" required /></>}</>}
      {err && <div className="err" role="alert">{err}</div>}{notice && !pending && <div className="authnotice" role="status">{notice}</div>}
      <button className="btn acc" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }} disabled={busy}>{busy ? 'Please wait…' : mode === 'forgot' ? 'Send recovery link' : mode === 'reset' ? 'Update password' : up ? 'Create account' : 'Sign in'}</button>
      {mode === 'in' && <button type="button" className="authlink" onClick={() => { setMode('forgot'); setErr(''); setNotice('') }}>Forgot your password?</button>}
      {['forgot', 'reset'].includes(mode) && <button type="button" className="authlink" onClick={() => { setMode('in'); setErr(''); setNotice('') }}>Back to sign in</button>}
    </form>
    {pending && <div className="mod authsuccess" role="dialog" aria-modal="true" aria-labelledby="authsuccess-title"><div><div className="authbadge">✓</div><p className="authcaption">LEDGERLINE ACCOUNT</p><h2 id="authsuccess-title">{up ? 'You’re all set.' : 'Welcome back.'}</h2><p className="lead">{up ? 'Your business workspace has been created successfully.' : 'You have signed in successfully. Your workspace is ready.'}</p>{pending.emailSent === false && <p className="warn" role="status">You’re signed in, but the email alert could not be sent. The administrator needs to check the server’s SMTP settings.</p>}<button className="btn acc" onClick={() => onAuth(pending.user, pending.token)}>Continue to Ledgerline</button></div></div>}</div>
  )
}

import { useState } from 'react'
import { api } from './api'
import { DataTable } from './ui'

const POLICY = ['po_over_limit', 'credit_block'], when = s => String(s).slice(0, 16).replace('T', ' ')
export default function Automation({ S, role, toast, reload }) {
  const [busy, setBusy] = useState(false), [draft, setDraft] = useState({}), admin = role === 'admin'
  const failedRuns = S.runs.filter(r => r.status === 'failed' && Date.now() - new Date(r.at.replace(' ', 'T') + 'Z') < 864e5), failedMail = S.outbox.filter(o => o.status === 'failed')
  const mine = S.tasks.filter(t => t.status === 'open' && (role === 'admin' || role === 'ceo' || t.role === role))
  const call = async (fn, ok) => { try { const r = await fn(); toast(typeof ok === 'function' ? ok(r) : ok); await reload() } catch (e) { toast(e.message) } }
  const val = (r, k) => (draft[r.id] && draft[r.id][k] !== undefined ? draft[r.id][k] : r[k]), edit = (r, k, v) => setDraft({ ...draft, [r.id]: { ...(draft[r.id] || {}), [k]: v } })
  const save = r => call(() => api('/automation/rules/' + r.id, 'PUT', { enabled: val(r, 'enabled'), channel: val(r, 'channel'), param: val(r, 'param') }), 'Rule saved').then(() => setDraft({ ...draft, [r.id]: undefined }))
  return (
    <div className="page"><div className="row sp"><div><h1>Automation centre</h1><p className="lead">Rules watch your data every 15 minutes and create tasks, reminders and approvals. Nothing is sent without a configured channel.</p></div>
      {['admin', 'manager', 'accountant'].includes(role) && <button className="btn acc" disabled={busy} onClick={async () => { setBusy(true); await call(() => api('/automation/run', 'POST'), r => `Run complete: ${r.created} new item(s)`); setBusy(false) }}>{busy ? 'Running…' : 'Run rules now'}</button>}</div>
      {(failedRuns.length > 0 || failedMail.length > 0) && <div className="warn">{failedRuns.length} automation run(s) and {failedMail.length} email(s) failed. Check the history and delivery log below.</div>}
      <div className="card"><h3>Rules</h3><div className="tw"><table><thead><tr><th>On</th><th>Rule</th><th>Channel</th><th className="n">Days</th><th /></tr></thead><tbody>{S.rules.map(r => <tr key={r.id}>
        <td><input type="checkbox" disabled={!admin} checked={!!val(r, 'enabled')} onChange={e => edit(r, 'enabled', e.target.checked)} /></td><td>{r.name} {POLICY.includes(r.kind) && <span className="pill q">enforced when saving</span>}</td>
        <td>{POLICY.includes(r.kind) ? '–' : <select disabled={!admin} style={{ width: 130 }} value={val(r, 'channel')} onChange={e => edit(r, 'channel', e.target.value)}><option value="inapp">In-app</option><option value="whatsapp">WhatsApp link</option><option value="email">Email</option></select>}</td>
        <td className="n">{POLICY.includes(r.kind) || r.kind === 'low_stock' || r.kind === 'expense_over_budget' || r.kind === 'lead_unassigned' ? '–' : <input type="number" min="0" disabled={!admin} style={{ width: 80 }} value={val(r, 'param')} onChange={e => edit(r, 'param', e.target.value)} />}</td>
        <td>{admin && draft[r.id] && <button className="btn acc sm" onClick={() => save(r)}>Save</button>}</td></tr>)}</tbody></table></div>
        <small style={{ color: 'var(--mut)' }}>WhatsApp creates a ready-to-send message link (sending through the WhatsApp Business API needs an approved provider). Email sends only when SMTP is configured on the server; otherwise it is logged as failed.</small></div>
      <div className="card"><h3>Open tasks ({mine.length})</h3><DataTable size={8} rows={mine} empty="No open tasks for your role." cols={[{ h: 'Task', f: t => <><b>{t.title}</b><br /><small style={{ color: 'var(--mut)' }}>{t.detail}</small></> }, { h: 'For', f: t => <span className="pill q">{t.role}</span> }, { h: 'Created', f: t => when(t.created), v: t => t.created },
        { h: '', nosort: 1, f: t => <div className="row">{t.link && <a className="btn wa sm" target="_blank" rel="noreferrer" href={t.link}>Send on WhatsApp</a>}<button className="btn ghost sm" onClick={() => call(() => api(`/tasks/${t.id}/done`, 'POST'), 'Marked done')}>Done</button></div> }]} /></div>
      <div className="cols2"><div className="card"><h3>Execution history</h3><DataTable size={8} rows={S.runs} empty="No runs yet." cols={[{ h: 'When', f: r => when(r.at), v: r => r.at }, { h: 'Rule', f: r => r.name }, { h: 'Result', f: r => <span className={'pill ' + (r.status === 'ok' ? 'd' : 'o')}>{r.status}</span> }, { h: 'Detail', f: r => r.detail }]} /></div>
        <div className="card"><h3>Email delivery log</h3><DataTable size={8} rows={S.outbox} empty="No emails queued." cols={[{ h: 'When', f: o => when(o.created), v: o => o.created }, { h: 'To', f: o => o.recipient || '–' }, { h: 'Subject', f: o => o.subject }, { h: 'Status', f: o => <span className={'pill ' + (o.status === 'sent' ? 'd' : o.status === 'failed' ? 'o' : 'p')} title={o.error}>{o.status}</span> }]} /></div></div>
    </div>
  )
}

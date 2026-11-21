import { useState } from 'react'
import { inr, fd, today, uid, wa, calc } from './utils'
import { Field, DataTable, Modal } from './ui'

const STAGES = ['New', 'Contacted', 'Quoted', 'Won', 'Lost']
const blank = { name: '', company: '', phone: '', email: '', value: '', stage: 'New', follow_up: '', note: '' }

export default function CRM({ S, set, toast }) {
  const [tab, setTab] = useState('c360'), [f, setF] = useState(blank), [prof, setProf] = useState(null), t = today()
  const costOf = code => +(S.products.find(p => p.code === code) || {}).cost || 0
  const stats = c => {
    const inv = S.docs.filter(d => d.type === 'invoice' && d.status === 'approved' && d.cust === c.id), ltv = inv.reduce((a, d) => a + (d.total || 0), 0), out = inv.reduce((a, d) => a + (d.total || 0) - (d.paid_amt || 0), 0)
    const profit = inv.reduce((a, d) => a + calc(d).t - d.items.reduce((x, i) => x + costOf(i.code) * i.qty, 0), 0)
    return { inv, ltv, out, profit, last: inv.map(d => d.date).sort().pop() || '' }
  }
  const rows = S.customers.map(c => ({ ...c, ...stats(c) }))
  const addLead = () => { if (!f.name.trim()) return toast('Enter the lead name'); set('leads', [...S.leads, { ...f, id: uid(), value: +f.value || 0 }]); setF(blank); toast('Lead added') }
  const move = (l, d) => set('leads', S.leads.map(x => (x.id === l.id ? { ...x, stage: STAGES[Math.max(0, Math.min(4, STAGES.indexOf(l.stage) + d))] } : x)))
  const convert = l => { set('customers', [...S.customers, { id: uid(), name: l.company || l.name, attn: l.name, phone: l.phone, a1: '', a2: '', gst: '', pan: '', logo: '', pincode: '', credit_limit: 0 }]); toast('Customer created from lead') }
  const due = S.leads.filter(l => !['Won', 'Lost'].includes(l.stage) && l.follow_up && l.follow_up <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)).sort((a, b) => a.follow_up.localeCompare(b.follow_up))
  const p = prof && rows.find(r => r.id === prof)
  return (
    <div className="page"><h1>CRM & customers</h1><p className="lead">Customer 360, sales pipeline and follow-up reminders.</p>
      <div className="tabbar">{[['c360', 'Customer 360'], ['pipe', 'Pipeline'], ['fu', `Follow-ups (${due.length})`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'c360' && <div className="card"><DataTable rows={rows} empty="Add customers to see their profile." cols={[
        { h: 'Customer', f: r => <a href="#c" onClick={e => { e.preventDefault(); setProf(r.id) }} style={{ color: 'var(--teal)' }}>{r.name}</a>, v: r => r.name }, { h: 'Orders', n: 1, f: r => r.inv.length }, { h: 'Lifetime value', n: 1, f: r => inr(r.ltv), v: r => r.ltv },
        { h: 'Gross profit', n: 1, f: r => inr(r.profit), v: r => r.profit }, { h: 'Outstanding', n: 1, f: r => inr(r.out), v: r => r.out }, { h: 'Credit limit', n: 1, f: r => (r.credit_limit ? inr(r.credit_limit) : 'No limit'), v: r => r.credit_limit },
        { h: 'Credit used', nosort: 1, f: r => (r.credit_limit ? <span className={'pill ' + (r.out > r.credit_limit ? 'o' : 'd')}>{Math.round((r.out / r.credit_limit) * 100)}%</span> : '–') }, { h: 'Last order', f: r => fd(r.last), v: r => r.last }]} /></div>}
      {tab === 'pipe' && <>
        <div className="card"><h3>Add a lead</h3><div className="grid">{[['name', 'Contact name'], ['company', 'Company'], ['phone', 'Phone (WhatsApp)'], ['email', 'Email'], ['value', 'Expected value']].map(([k, l]) => <Field key={k} l={l}><input type={k === 'value' ? 'number' : 'text'} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></Field>)}
          <Field l="Follow-up date"><input type="date" value={f.follow_up} onChange={e => setF({ ...f, follow_up: e.target.value })} /></Field><Field l="Note"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field></div><p><button className="btn acc" onClick={addLead}>Add lead</button></p></div>
        <div className="kan">{STAGES.map(st => { const L = S.leads.filter(l => l.stage === st); return <div className="col" key={st}><h4><span>{st}</span><span>{L.length} · {inr(L.reduce((a, l) => a + (+l.value || 0), 0))}</span></h4>
          {L.map(l => <div className="lead-card" key={l.id}><b>{l.name}</b>{l.company && <div style={{ color: 'var(--mut)' }}>{l.company}</div>}<div>{inr(l.value)}{l.follow_up && <span className={'pill ' + (l.follow_up < t ? 'o' : 'q')} style={{ marginLeft: 6 }}>{fd(l.follow_up)}</span>}</div>
            <div className="row" style={{ marginTop: 6 }}><button className="btn ghost sm" onClick={() => move(l, -1)} disabled={st === 'New'}>◀</button><button className="btn ghost sm" onClick={() => move(l, 1)} disabled={st === 'Lost'}>▶</button>
              {st === 'Won' && <button className="btn acc sm" onClick={() => convert(l)}>Make customer</button>}<button className="btn bad sm" onClick={() => confirm('Delete this lead?') && set('leads', S.leads.filter(x => x.id !== l.id))}>×</button></div></div>)}</div> })}</div></>}
      {tab === 'fu' && <div className="card"><h3>Due in the next 7 days</h3><DataTable rows={due} empty="No follow-ups due. You are all caught up." cols={[{ h: 'When', f: l => <span className={'pill ' + (l.follow_up < t ? 'o' : 'q')}>{l.follow_up < t ? 'Overdue ' : ''}{fd(l.follow_up)}</span>, v: l => l.follow_up }, { h: 'Lead', f: l => l.name }, { h: 'Company', f: l => l.company }, { h: 'Stage', f: l => l.stage }, { h: 'Note', f: l => l.note },
        { h: '', nosort: 1, f: l => <a className="btn wa sm" target="_blank" rel="noreferrer" href={wa(l.phone, `Hello ${l.name}, following up from ${S.company.name}. Is now a good time to talk?`)}>WhatsApp</a> }]} /></div>}
      {p && <Modal title={p.name} onClose={() => setProf(null)} w={820}>
        <div className="kpis"><div className="kpi"><label>Lifetime value</label><b>{inr(p.ltv)}</b></div><div className="kpi"><label>Outstanding</label><b>{inr(p.out)}</b></div><div className="kpi"><label>Gross profit</label><b>{inr(p.profit)}</b></div></div>
        <p className="lead">{[p.attn, p.phone, p.a1, p.a2, p.gst && 'GSTIN ' + p.gst].filter(Boolean).join(' · ')}</p>
        <h3>Purchase history</h3><DataTable size={5} rows={p.inv} cols={[{ h: 'Invoice', f: d => d.no }, { h: 'Date', f: d => fd(d.date), v: d => d.date }, { h: 'Total', n: 1, f: d => inr(d.total), v: d => d.total }, { h: 'Balance', n: 1, f: d => inr((d.total || 0) - (d.paid_amt || 0)) }]} />
        <h3 style={{ marginTop: 16 }}>Payment history</h3><DataTable size={5} empty="No payments yet." rows={S.payments.filter(x => x.kind === 'receipt' && x.party === p.id)} cols={[{ h: 'Date', f: x => fd(x.date), v: x => x.date }, { h: 'Amount', n: 1, f: x => inr(x.amount), v: x => x.amount }, { h: 'Mode', f: x => x.mode }, { h: 'Reference', f: x => x.ref }]} /></Modal>}
    </div>
  )
}

import { useState } from 'react'
import { inr, fd, calc, ago, wa, GSTIN } from './utils'
import { alerts } from './analytics'
import { Field, Upload, Status } from './ui'

export function Dashboard({ S, go, view }) {
  const inv = S.docs.filter(d => d.type === 'invoice'), pend = inv.filter(d => !d.paid), over = pend.filter(d => ago(d.date) > 7)
  const cust = id => S.customers.find(c => c.id === id) || {}
  return (
    <div className="page"><h1>Welcome, {S.company.name}</h1><p className="lead">Your billing and stock at a glance.</p>
      {(() => { const A = alerts(S); return A.length > 0 && <div className="card"><div className="row sp"><h3>Alerts ({A.length})</h3><a className="btn wa sm" target="_blank" rel="noreferrer" href={wa(S.company.phone, 'Ledgerline alerts:\n' + A.map(a => '• ' + a.t).join('\n'))}>Send summary on WhatsApp</a></div>
        {A.slice(0, 6).map((a, i) => <div key={i} className="row" style={{ padding: '6px 0' }}><span className={'pill ' + (a.k === 'bad' ? 'o' : 'p')}>{a.k === 'bad' ? 'Critical' : 'Attention'}</span>{a.t}</div>)}</div> })()}
      <div className="stats">
        <div className="stat s1" onClick={() => go('invoices')}><b>{inv.length}</b>Invoices</div>
        <div className="stat s2" onClick={() => go('invoices')}><b>{pend.length}</b>Pending invoices</div>
        <div className="stat s3" onClick={() => go('products')}><b>{S.products.length}</b>Products</div>
      </div>
      <div className="card"><h3>Pending invoices</h3><div className="tw"><table>
        <thead><tr><th>Invoice no.</th><th>Customer name</th><th>Date of issue</th><th className="n">Total</th><th className="n">GST</th><th className="n">Net total</th><th>Status</th><th /></tr></thead>
        <tbody>{pend.map(d => { const c = calc(d), cu = cust(d.cust); return (
          <tr key={d.id}><td>{d.no}</td><td>{cu.name}</td><td>{fd(d.date)}</td><td className="n">{inr(c.t)}</td><td className="n">{inr(c.g)}</td><td className="n">{inr(c.n)}</td><td><Status d={d} /></td>
            <td className="row"><button className="btn ghost sm" onClick={() => view(d.id)}>View</button>
              <a className="btn wa sm" target="_blank" rel="noreferrer" href={wa(cu.phone, `Hello ${cu.name}, a reminder from ${S.company.name}: invoice ${d.no} dated ${fd(d.date)} for ${inr(c.n)} is pending. Please arrange payment. Thank you.`)}>Remind</a></td></tr>) })}</tbody></table>
        {!pend.length && <div className="empty">All invoices are paid.</div>}</div></div></div>
  )
}

export function Company({ S, set, toast }) {
  const [f, setF] = useState(S.company)
  const u = k => e => setF({ ...f, [k]: e.target.value }), up = k => v => setF({ ...f, [k]: v })
  return (
    <div className="page"><h1>Company management</h1><p className="lead">These details print on every invoice and quotation.</p>
      <div className="card"><div className="grid">
        <Field l="Company name"><input value={f.name} onChange={u('name')} /></Field>
        <Field l="PAN no."><input value={f.pan} onChange={u('pan')} /></Field>
        <Field l="Address"><textarea value={f.address} onChange={u('address')} /></Field>
        <Field l="Bank details"><textarea value={f.bank} onChange={u('bank')} /></Field>
        <Field l="Phone no."><input value={f.phone} onChange={u('phone')} /></Field>
        <Field l="Pincode"><input value={f.pincode || ''} onChange={u('pincode')} maxLength={6} /></Field>
        <Field l="Currency"><select value={f.currency || 'INR'} onChange={u('currency')}>{['INR', 'USD', 'EUR', 'GBP', 'AED'].map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field l="Financial year starts in"><select value={f.fy_start || 4} onChange={e => setF({ ...f, fy_start: +e.target.value })}>{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
        <Field l="Purchase approval limit (0 = none)"><input type="number" min="0" value={f.po_limit || 0} onChange={u('po_limit')} /></Field>
        <Field l="Invoice template"><select value={f.invoice_template || 'classic'} onChange={u('invoice_template')}><option value="classic">Classic</option><option value="modern">Modern</option><option value="minimal">Minimal</option></select></Field>
        <Field l="Monthly revenue target"><input type="number" min="0" value={f.revenue_target || 0} onChange={u('revenue_target')} /></Field>
        <Field l="Customer payment terms (days)"><input type="number" min="0" value={f.credit_days || 30} onChange={u('credit_days')} /></Field>
        <Field l="Supplier payment terms (days)"><input type="number" min="0" value={f.pay_days || 30} onChange={u('pay_days')} /></Field>
        <Field l="E-invoicing"><label className="row" style={{ color: 'var(--ink)' }}><input type="checkbox" checked={!!f.einvoice} onChange={e => setF({ ...f, einvoice: e.target.checked })} />My turnover requires e-invoicing</label></Field>
        <Field l="GST no."><input value={f.gst} onChange={u('gst')} /></Field>
        <Upload l="Company logo" v={f.logo} set={up('logo')} /><Upload l="Bank QR code" v={f.qr} set={up('qr')} /><Upload l="Company seal" v={f.seal} set={up('seal')} />
      </div><p><button className="btn acc" onClick={() => { if (f.gst && !GSTIN.test(f.gst.trim().toUpperCase())) return toast('Enter a valid 15-character GSTIN'); set('company', { ...f, gst: f.gst.trim().toUpperCase() }); toast('Company details saved') }}>Save company details</button></p></div></div>
  )
}

export function Reports({ kind, S }) {
  const [a, setA] = useState(''), [b, setB] = useState('')
  const inv = S.docs.filter(d => d.type === 'invoice' && (!a || d.date >= a) && (!b || d.date <= b))
  const name = id => (S.customers.find(c => c.id === id) || {}).name
  const by = S.customers.map(c => { const l = inv.filter(d => d.cust === c.id); return { c, n: l.length, t: l.reduce((s, d) => s + calc(d).n, 0), p: l.filter(d => !d.paid).reduce((s, d) => s + calc(d).n, 0) } }).filter(r => r.n)
  return (
    <div className="page"><div className="row sp"><div><h1>{kind === 'c' ? 'Customer-wise' : 'Invoice-wise'} report</h1><p className="lead">Filter by date range, then save as PDF.</p></div>
      <button className="btn noprint" onClick={() => window.print()}>Download PDF</button></div>
      <div className="card"><div className="fl noprint"><div><label>From</label><input type="date" value={a} onChange={e => setA(e.target.value)} /></div><div><label>To</label><input type="date" value={b} onChange={e => setB(e.target.value)} /></div></div>
        <div className="tw">{kind === 'c' ? (
          <table><thead><tr><th>Customer</th><th className="n">Invoices</th><th className="n">Billed</th><th className="n">Outstanding</th></tr></thead>
            <tbody>{by.map(r => <tr key={r.c.id}><td>{r.c.name}</td><td className="n">{r.n}</td><td className="n">{inr(r.t)}</td><td className="n">{inr(r.p)}</td></tr>)}
              <tr><td><b>Total</b></td><td className="n">{by.reduce((s, r) => s + r.n, 0)}</td><td className="n"><b>{inr(by.reduce((s, r) => s + r.t, 0))}</b></td><td className="n"><b>{inr(by.reduce((s, r) => s + r.p, 0))}</b></td></tr></tbody></table>
        ) : (
          <table><thead><tr><th>Invoice no.</th><th>Customer</th><th>Date</th><th className="n">Net total</th><th>Status</th></tr></thead>
            <tbody>{inv.map(d => <tr key={d.id}><td>{d.no}</td><td>{name(d.cust)}</td><td>{fd(d.date)}</td><td className="n">{inr(calc(d).n)}</td><td><Status d={d} /></td></tr>)}</tbody></table>
        )}</div>{!inv.length && <div className="empty">No invoices in this range.</div>}</div></div>
  )
}

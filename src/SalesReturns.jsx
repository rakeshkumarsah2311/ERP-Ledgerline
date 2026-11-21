import { useState } from 'react'
import { api } from './api'
import { inr, fd, today } from './utils'
import { Field, DataTable } from './ui'

const returned = (S, inv, code) => S.credit_notes.filter(n => n.invoice_id === inv.id).flatMap(n => n.items).filter(i => i.code === code).reduce((a, i) => a + i.qty, 0)

// Sales returns: choose an approved invoice, enter the quantities coming back, and a credit note is issued.
export default function SalesReturns({ S, toast, reload, pre }) {
  const [inv, setInv] = useState(pre || ''), [q, setQ] = useState({}), [reason, setReason] = useState(''), [restock, setRestock] = useState(true), [date, setDate] = useState(today()), [view, setView] = useState(null), [busy, setBusy] = useState(false)
  const d = S.docs.find(x => x.id === inv), cn = id => (S.customers.find(c => c.id === id) || {}).name || '', invoices = S.docs.filter(x => x.type === 'invoice' && x.status === 'approved')
  const gross = d ? d.items.reduce((a, i) => a + i.price * i.qty, 0) : 0, k = d && gross ? 1 - Math.min(+d.discount || 0, gross) / gross : 0
  const est = d ? d.items.reduce((a, i) => { const n = +q[i.code] || 0, tx = i.price * n * k; return a + tx + (tx * (i.rate ?? 18)) / 100 }, 0) : 0
  const submit = async () => {
    const lines = d.items.map(i => ({ code: i.code, qty: +q[i.code] || 0 })).filter(l => l.qty > 0); if (!lines.length) return toast('Enter a quantity to return')
    setBusy(true); try { const r = await api('/returns', 'POST', { invoice_id: inv, date, reason, restock, lines }); toast(`Credit note ${r.no} issued for ${inr(r.total)}`); setQ({}); setReason(''); await reload() } catch (e) { toast(e.message) } setBusy(false)
  }
  if (view) {
    const n = S.credit_notes.find(x => x.id === view), co = S.company, iv = S.docs.find(x => x.id === n.invoice_id) || {}, cu = S.customers.find(c => c.id === n.cust) || {}
    return <div className="page"><div className="row noprint" style={{ marginBottom: 16 }}><button className="btn ghost" onClick={() => setView(null)}>Back</button><button className="btn" onClick={() => window.print()}>Print / PDF</button></div>
      <div className={'sheet ' + (co.invoice_template || 'classic')}><div className="row sp">{co.logo ? <img className="lg" src={co.logo} alt="" /> : <h2>{co.name}</h2>}<div style={{ textAlign: 'right' }}><h1>Credit Note</h1><div>No: <b>{n.no}</b></div><div>Date: {fd(n.date)}</div><div>Against invoice: {iv.no}</div></div></div>
        <div className="two"><div><b>Issued to</b><br />{cu.name}<br />{cu.a1}<br />{cu.a2}<br />GSTIN: {cu.gst || '–'}</div><div><b>Issued by</b><br />{co.name}<br />{co.address}<br />GSTIN: {co.gst}</div></div>
        <table><thead><tr><th>Sr.</th><th>Product</th><th>HSN</th><th className="n">Qty</th><th className="n">Rate</th><th className="n">GST</th><th className="n">Taxable value</th></tr></thead><tbody>{n.items.map((i, x) => <tr key={x}><td>{x + 1}</td><td>{i.name}</td><td>{i.hsn}</td><td className="n">{i.qty}</td><td className="n">{inr(i.price)}</td><td className="n">{i.rate}%</td><td className="n">{inr(i.taxable)}</td></tr>)}</tbody></table>
        <div className="tot"><div><span>Taxable value</span><span>{inr(n.taxable)}</span></div><div><span>GST reversed</span><span>{inr(n.tax)}</span></div><div className="g"><span>Credit total</span><span>{inr(n.total)}</span></div></div>{n.reason && <p>Reason: {n.reason}</p>}</div></div>
  }
  return (
    <div className="page"><h1>Sales returns & credit notes</h1><p className="lead">Returned goods reverse the sale and GST, reduce what the customer owes, and can go back into stock.</p>
      <div className="card"><h3>New credit note</h3><div className="grid"><Field l="Invoice"><select value={inv} onChange={e => { setInv(e.target.value); setQ({}) }}><option value="">Select an approved invoice</option>{invoices.map(x => <option key={x.id} value={x.id}>{x.no} · {cn(x.cust)} · {inr(x.total)}</option>)}</select></Field>
        <Field l="Credit note date"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field><Field l="Reason"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Damaged, wrong item…" /></Field></div>
        {d && <><div className="tw"><table><thead><tr><th>Product</th><th className="n">Invoiced</th><th className="n">Already returned</th><th className="n">Return now</th></tr></thead><tbody>{d.items.map(i => { const r = returned(S, d, i.code), left = i.qty - r; return <tr key={i.code}><td>{i.name}</td><td className="n">{i.qty}</td><td className="n">{r}</td>
          <td className="n"><input type="number" min="0" max={left} step="any" disabled={left <= 0} style={{ width: 90 }} value={q[i.code] ?? ''} onChange={e => setQ({ ...q, [i.code]: e.target.value })} /></td></tr> })}</tbody></table></div>
          <p className="row"><label className="row" style={{ color: 'var(--ink)', margin: 0 }}><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} />Put returned goods back into stock</label><span style={{ marginLeft: 'auto' }}>Estimated credit: <b>{inr(est)}</b></span></p>
          <button className="btn acc" disabled={busy} onClick={submit}>{busy ? 'Issuing…' : 'Issue credit note'}</button></>}</div>
      <div className="card"><h3>Credit notes</h3><DataTable rows={S.credit_notes.slice().reverse()} empty="No credit notes issued yet." cols={[{ h: 'No.', f: n => n.no }, { h: 'Date', f: n => fd(n.date), v: n => n.date }, { h: 'Invoice', f: n => (S.docs.find(x => x.id === n.invoice_id) || {}).no }, { h: 'Customer', f: n => cn(n.cust) },
        { h: 'Total', n: 1, f: n => inr(n.total), v: n => n.total }, { h: 'Restocked', f: n => (n.restock ? <span className="pill d">Yes</span> : <span className="pill q">No</span>), nosort: 1 }, { h: '', nosort: 1, f: n => <button className="btn ghost sm" onClick={() => setView(n.id)}>View</button> }]} /></div>
    </div>
  )
}

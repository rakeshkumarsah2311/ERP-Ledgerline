import { useState } from 'react'
import { api } from './api'
import { inr, fd, today, uid, wa, GSTIN, UOM } from './utils'
import { Field, Status } from './ui'
import PayModal from './Pay.jsx'
import { Crud } from './Master.jsx'

export const Suppliers = p => (
  <Crud {...p} title="Suppliers" lead="Vendors you buy stock from." coll="suppliers" blank={{ name: '', gstin: '', phone: '', address: '' }}
    valid={f => (!f.name.trim() ? 'Enter the supplier name' : f.gstin && !GSTIN.test(f.gstin.trim().toUpperCase()) ? 'Enter a valid 15-character GSTIN' : '')}
    fields={(f, s) => { const u = k => e => s({ ...f, [k]: e.target.value }); return [
      <Field key="a" l="Supplier name"><input value={f.name} onChange={u('name')} /></Field>, <Field key="b" l="GSTIN"><input value={f.gstin || ''} onChange={e => s({ ...f, gstin: e.target.value.toUpperCase() })} /></Field>,
      <Field key="c" l="Phone (WhatsApp)"><input value={f.phone || ''} onChange={u('phone')} /></Field>, <Field key="d" l="Address"><textarea value={f.address || ''} onChange={u('address')} /></Field>] }}
    cols={[['Supplier', r => r.name], ['GSTIN', r => r.gstin], ['Phone', r => r.phone], ['Address', r => r.address]]} />
)

const total = p => { const base = p.items.reduce((a, i) => a + i.qty * i.price, 0), tax = p.items.reduce((a, i) => a + (i.qty * i.price * (i.rate ?? 18)) / 100, 0); return { base, tax, n: base + tax } }
const pill = s => <span className={'pill ' + (s === 'received' || s === 'approved' ? 'd' : s === 'sent' || s === 'awaiting_approval' ? 'p' : 'q')}>{String(s).replace('_', ' ')}</span>

export function POList({ S, go }) {
  const sn = id => (S.suppliers.find(x => x.id === id) || {}).name
  return (
    <div className="page"><div className="row sp"><div><h1>Purchase orders</h1><p className="lead">Order stock from suppliers and receive it into a warehouse as a lot.</p></div><button className="btn acc" onClick={() => go('po-new')}>+ Create purchase order</button></div>
      <div className="card"><div className="tw"><table><thead><tr><th>PO no.</th><th>Supplier</th><th>Date</th><th>Warehouse</th><th className="n">Total</th><th>Status</th><th /></tr></thead>
        <tbody>{S.pos.map(p => <tr key={p.id}><td>{p.no}</td><td>{sn(p.supplier)}</td><td>{fd(p.date)}</td><td>{(S.warehouses.find(w => w.id === p.warehouse) || {}).name}</td><td className="n">{inr(total(p).n)}</td><td>{pill(p.status)}</td>
          <td><button className="btn ghost sm" onClick={() => go('po-view', { id: p.id })}>View</button></td></tr>)}</tbody></table>
        {!S.pos.length && <div className="empty">No purchase orders yet. Create one here or from the AI forecasting page.</div>}</div></div></div>
  )
}

export function POEditor({ S, set, go, toast, prefill }) {
  const nextNo = 'PO-' + (Math.max(1000, ...S.pos.map(p => parseInt(String(p.no).replace(/\D/g, '')) || 0)) + 1)
  const [f, setF] = useState({ supplier: '', warehouse: S.warehouses[0]?.id || '', date: today(), note: '', items: prefill || [] }), [pick, setPick] = useState('')
  const t = total(f), upd = (k, key, v) => setF({ ...f, items: f.items.map((i, x) => (x === k ? { ...i, [key]: v } : i)) })
  const addProduct = () => {
    const p = S.products.find(x => x.id === pick); if (!p) return toast('Select a product')
    setF({ ...f, items: [...f.items, { code: p.code, name: p.name, uom: p.uom, qty: 1, price: +p.price, hsn: p.hsn || '', rate: p.gst_rate ?? 18 }] }); setPick('')
  }
  const save = () => {
    if (!f.supplier) return toast('Select a supplier'); if (!f.items.length) return toast('Add at least one product')
    if (f.items.some(i => !(+i.qty > 0) || !(+i.price >= 0))) return toast('Check quantities and prices')
    const po = { id: uid(), no: nextNo, date: f.date, supplier: f.supplier, warehouse: f.warehouse, status: 'draft', note: f.note, items: f.items.map(i => ({ ...i, qty: +i.qty, price: +i.price })) }
    set('pos', [...S.pos, po]); toast(`${po.no} saved as draft`); go('po-view', { id: po.id })
  }
  return (
    <div className="page"><h1>New purchase order <small style={{ color: 'var(--mut)', fontSize: 16 }}>{nextNo}</small></h1><p className="lead">{prefill ? 'Prefilled from your forecast. Adjust quantities and prices as needed.' : 'Choose a supplier and add the products to order.'}</p>
      <div className="card"><div className="grid">
        <Field l="Supplier"><select value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })}><option value="">Select supplier</option>{S.suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field l="Deliver to warehouse"><select value={f.warehouse} onChange={e => setF({ ...f, warehouse: e.target.value })}>{S.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field l="Order date"><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field><Field l="Note"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field></div></div>
      <div className="card"><h3>Items</h3><div className="row"><select style={{ maxWidth: 340 }} value={pick} onChange={e => setPick(e.target.value)}><option value="">Add a product…</option>{S.products.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}</select><button className="btn" onClick={addProduct}>+ Add</button></div>
        <div className="tw"><table><thead><tr><th>Code</th><th>Product</th><th>UOM</th><th className="n">Qty</th><th className="n">Unit price</th><th className="n">GST</th><th className="n">Amount</th><th /></tr></thead>
          <tbody>{f.items.map((i, k) => <tr key={k}><td>{i.code}</td><td>{i.name}</td><td>{i.uom}</td><td className="n"><input type="number" min="1" style={{ width: 80 }} value={i.qty} onChange={e => upd(k, 'qty', e.target.value)} /></td>
            <td className="n"><input type="number" min="0" style={{ width: 100 }} value={i.price} onChange={e => upd(k, 'price', e.target.value)} /></td><td className="n">{i.rate}%</td><td className="n">{inr(i.qty * i.price)}</td>
            <td><button className="btn bad sm" onClick={() => setF({ ...f, items: f.items.filter((_, x) => x !== k) })}>Remove</button></td></tr>)}</tbody></table>
          {!f.items.length && <div className="empty">No items yet.</div>}</div>
        <div className="tot"><div><span>Subtotal</span><span>{inr(t.base)}</span></div><div><span>GST</span><span>{inr(t.tax)}</span></div><div className="g"><span>Total</span><span>{inr(t.n)}</span></div></div></div>
      <p className="row"><button className="btn acc" onClick={save}>Save as draft</button><button className="btn ghost" onClick={() => go('pos')}>Cancel</button></p></div>
  )
}

export function POView({ S, id, go, toast, reload, role }) {
  const [pay, setPay] = useState(false), po = S.pos.find(p => p.id === id), sup = po && (S.suppliers.find(s => s.id === po.supplier) || {}), wh = po && (S.warehouses.find(w => w.id === po.warehouse) || {})
  if (!po) return <div className="page"><button className="btn ghost" onClick={() => go('pos')}>Back</button></div>
  const t = total(po), bal = Math.round(((po.total || t.n) - (po.paid_amt || 0)) * 100) / 100, canPay = ['admin', 'manager', 'accountant'].includes(role), canAct = role === 'admin' || role === 'manager'
  const msg = `Hello ${sup.name}, purchase order ${po.no} from ${S.company.name}:\n` + po.items.map(i => `• ${i.name} × ${i.qty} ${i.uom} @ ${inr(i.price)}`).join('\n') + `\nTotal incl. GST: ${inr(t.n)}. Please confirm delivery date.`
  const call = async (path, ok) => { try { const r = await api(path, 'POST'); toast(typeof ok === 'function' ? ok(r) : ok); await reload() } catch (e) { toast(e.message) } }
  const remove = async () => { if (!confirm('Delete this draft?')) return; try { await api('/pos/' + po.id, 'DELETE'); toast('Draft deleted'); await reload(); go('pos') } catch (e) { toast(e.message) } }
  const lim = +S.company.po_limit || 0, needsApproval = po.status === 'draft' && lim > 0 && t.n > lim && role !== 'admin'
  return (
    <div className="page"><div className="row noprint" style={{ marginBottom: 16 }}>
      <button className="btn ghost" onClick={() => go('pos')}>Back</button><button className="btn" onClick={() => window.print()}>Print / PDF</button>{pill(po.status)}
      {canAct && needsApproval && <button className="btn acc" onClick={() => call(`/pos/${po.id}/send`, 'Sent to an admin for approval')}>Submit for approval</button>}
      {canAct && !needsApproval && ['draft', 'approved', 'sent'].includes(po.status) && <a className="btn wa" target="_blank" rel="noreferrer" href={wa(sup.phone, msg)} onClick={() => po.status !== 'sent' && call(`/pos/${po.id}/send`, 'Marked as sent')}>Send on WhatsApp</a>}
      {canAct && po.status !== 'received' && po.status !== 'awaiting_approval' && <button className="btn acc" onClick={() => confirm('Receive all items into ' + (wh.name || 'the warehouse') + '? This creates lots, adds stock and books the payable.') && call(`/pos/${po.id}/receive`, r => `Received: ${r.created} lot(s) created${r.skipped ? `, ${r.skipped} item(s) skipped (product code not in catalogue)` : ''}`)}>Receive goods (GRN)</button>}
      {canPay && po.status === 'received' && bal > 0.005 && <button className="btn acc" onClick={() => setPay(true)}>Pay supplier</button>}
      {po.status === 'received' && <span className={'pill ' + (bal > 0.005 ? 'p' : 'd')}>{bal > 0.005 ? 'Balance ' + inr(bal) : 'Paid in full'}</span>}
      {po.status === 'draft' && canAct && <button className="btn bad" onClick={remove}>Delete draft</button>}</div>
      {pay && <PayModal kind="payment" doc={po} total={po.total || t.n} onClose={() => setPay(false)} toast={toast} reload={reload} />}
      <div className="sheet"><div className="row sp"><h2>{S.company.name}</h2><div style={{ textAlign: 'right' }}><h1>Purchase Order</h1><div>No: <b>{po.no}</b></div><div>Date: {fd(po.date)}</div></div></div>
        <div className="two"><div><b>Supplier</b><br />{sup.name}<br />{sup.address}<br />GSTIN: {sup.gstin || '–'}</div><div><b>Deliver to</b><br />{wh.name}<br />{S.company.address}<br />GSTIN: {S.company.gst}</div></div>
        <table><thead><tr><th>Sr.</th><th>Product</th><th>HSN</th><th>UOM</th><th className="n">Qty</th><th className="n">Unit price</th><th className="n">GST</th><th className="n">Amount</th></tr></thead>
          <tbody>{po.items.map((i, k) => <tr key={k}><td>{k + 1}</td><td>{i.name}</td><td>{i.hsn}</td><td>{i.uom}</td><td className="n">{i.qty}</td><td className="n">{inr(i.price)}</td><td className="n">{i.rate}%</td><td className="n">{inr(i.qty * i.price)}</td></tr>)}</tbody></table>
        <div className="tot"><div><span>Subtotal</span><span>{inr(t.base)}</span></div><div><span>GST</span><span>{inr(t.tax)}</span></div><div className="g"><span>Total</span><span>{inr(t.n)}</span></div></div>{po.note && <p>Note: {po.note}</p>}</div></div>
  )
}

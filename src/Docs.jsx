import { useState } from 'react'
import { inr, fd, calc, today, uid, wa, UOM, isIntra, words } from './utils'
import { Field, Status, DataTable } from './ui'
import PayModal from './Pay.jsx'
import { ScanModal } from './Scanner.jsx'
import { Compliance, QrImg } from './Compliance.jsx'

const RATES = [0, 5, 12, 18, 28], isMgr = r => r === 'admin' || r === 'manager'

export function DocList({ type, S, go, view }) {
  const [f, setF] = useState({ q: '', no: '', date: '', st: '', cust: '' })
  const u = k => e => setF({ ...f, [k]: e.target.value })
  const cn = id => (S.customers.find(c => c.id === id) || {}).name || ''
  const rows = S.docs.filter(d => d.type === type && (!f.no || d.no.includes(f.no)) && (!f.date || d.date === f.date) && (!f.cust || d.cust === f.cust) &&
    (!f.st || (f.st === 'paid') === !!d.paid) && (!f.q || (d.no + cn(d.cust)).toLowerCase().includes(f.q.toLowerCase())))
  const T = type === 'invoice' ? 'Invoice' : 'Quotation'
  return (
    <div className="page"><div className="row sp"><div><h1>{T} management</h1><p className="lead">{type === 'invoice' ? 'GST-ready invoices with approval and stock control.' : 'Prepare quotes and convert them to invoices in one click.'}</p></div>
      <button className="btn acc" onClick={() => go('new-' + type)}>+ Create {type}</button></div>
      <div className="card"><div className="fl">
        <input placeholder={`Search ${type}`} value={f.q} onChange={u('q')} /><input placeholder="Number" value={f.no} onChange={u('no')} /><input type="date" value={f.date} onChange={u('date')} />
        {type === 'invoice' && <select value={f.st} onChange={u('st')}><option value="">Paid or unpaid</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select>}
        <select value={f.cust} onChange={u('cust')}><option value="">All customers</option>{S.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <DataTable rows={rows} empty={`No ${type}s match. Create one to get started.`} cols={[{ h: 'No.', f: d => d.no }, { h: 'Customer name', f: d => cn(d.cust) }, { h: 'Date of issue', f: d => fd(d.date), v: d => d.date }, { h: 'Taxable', n: 1, f: d => inr(calc(d).t), v: d => calc(d).t }, { h: 'Discount', n: 1, f: d => inr(d.discount) },
          { h: 'GST', n: 1, f: d => inr(calc(d).g), v: d => calc(d).g }, { h: 'Net total', n: 1, f: d => inr(calc(d).n), v: d => calc(d).n }, { h: 'Status', f: d => <Status d={d} />, nosort: 1 }, { h: 'View', nosort: 1, f: d => <button className="btn ghost sm" onClick={() => view(d.id)}>View</button> }]} /></div></div>
  )
}

const blankItem = { code: '', name: '', uom: 'Unit', price: '', qty: 1, hsn: '', rate: 18, lot: '' }
const lineOf = p => ({ code: p.code, name: p.name, uom: p.uom, price: +p.price, qty: 1, hsn: p.hsn || '', rate: p.gst_rate ?? 18 })

export function Editor({ type, S, set, done, toast, view, role }) {
  const [f, setF] = useState({ cust: '', driver: '', warehouse: S.warehouses[0]?.id || '', centre: '', items: [], discount: 0, date: today(), share: true, docName: '' })
  const [it, setIt] = useState(blankItem), [open, setOpen] = useState(false), [scan, setScan] = useState(false), [q, setQ] = useState('')
  const cust = S.customers.find(x => x.id === f.cust), c = calc(f, isIntra(S.company, cust || {})), ui = k => e => setIt({ ...it, [k]: e.target.value })
  const needsApproval = type === 'invoice' && role === 'staff'
  const nextNo = () => { const n = Math.max(1233, ...S.docs.filter(d => d.type === type).map(d => parseInt(String(d.no).replace(/\D/g, '')) || 0)) + 1; return (type === 'quotation' ? 'Q-' : '') + n }
  const add = () => {
    if (!it.name || !(+it.price > 0) || !(+it.qty > 0)) return toast('Enter product name, price and quantity')
    setF({ ...f, items: [...f.items, { ...it, price: +it.price, qty: +it.qty, rate: +it.rate }] }); setIt(blankItem)
  }
  const onScan = code => {
    setScan(false)
    const p = S.products.find(x => x.barcode === code || x.code === code)
    if (!p) return toast(`No product found for code ${code}`)
    setF(s => { const k = s.items.findIndex(i => i.code === p.code); return { ...s, items: k >= 0 ? s.items.map((i, x) => (x === k ? { ...i, qty: i.qty + 1 } : i)) : [...s.items, lineOf(p)] } })
    toast(`${p.name} added`)
  }
  const save = () => {
    if (!f.cust) return toast('Select a customer'); if (!f.items.length) return toast('Add at least one product')
    if (type === 'invoice') {
      const short = S.products.find(p => p.manage && f.items.filter(i => i.code === p.code).reduce((a, i) => a + i.qty, 0) > p.qty)
      if (short) return toast(`Not enough stock for ${short.name} (${short.qty} available)`)
    }
    const d = { id: uid(), type, no: nextNo(), date: f.date, cust: f.cust, driver: f.driver, warehouse: f.warehouse, centre: f.centre || '', items: f.items, discount: +f.discount || 0, paid: false, doc: f.docName, status: needsApproval ? 'pending' : 'approved' }
    set('docs', [...S.docs, d])
    toast(needsApproval ? `Invoice ${d.no} sent for approval` : `${type === 'invoice' ? 'Invoice' : 'Quotation'} ${d.no} created`)
    if (f.share && cust && !needsApproval) window.open(wa(cust.phone, `Hello ${cust.name}, your ${type} ${d.no} from ${S.company.name} for ${inr(calc(d).n)} is ready.`), '_blank')
    view(d.id)
  }
  return (
    <div className="page"><h1>New {type}</h1><p className="lead">{needsApproval ? 'Your role needs a manager’s approval before this invoice is final and stock is deducted.' : 'Pick a customer, add products, and review GST before saving.'}</p>
      <div className="card"><div className="grid">
        <Field l="Search customer"><select value={f.cust} onChange={e => setF({ ...f, cust: e.target.value })}><option value="">Select customer</option>{S.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field l="Search driver"><select value={f.driver} onChange={e => setF({ ...f, driver: e.target.value })}><option value="">Select driver</option>{S.drivers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field l="Dispatch from warehouse"><select value={f.warehouse} onChange={e => setF({ ...f, warehouse: e.target.value })}>{S.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field l="Profit centre (optional)"><select value={f.centre} onChange={e => setF({ ...f, centre: e.target.value })}><option value="">None</option>{S.centres.filter(c => c.kind === 'profit').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field l="Date of issue"><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field></div></div>
      <div className="card"><div className="row sp"><h3>Add products</h3><div className="row"><button className="btn ghost sm" onClick={() => setScan(true)}>Scan barcode</button><button className="btn ghost sm" onClick={() => setOpen(true)}>Search catalogue</button></div></div>
        <div className="grid">
          <Field l="Product code"><input value={it.code} onChange={ui('code')} /></Field><Field l="Product name"><input value={it.name} onChange={ui('name')} /></Field>
          <Field l="HSN code"><input value={it.hsn} onChange={ui('hsn')} /></Field>
          <Field l="Product UOM"><select value={it.uom} onChange={ui('uom')}>{UOM.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field l="Product price (₹)"><input type="number" value={it.price} onChange={ui('price')} /></Field><Field l="Quantity"><input type="number" min="1" value={it.qty} onChange={ui('qty')} /></Field>
          <Field l="GST rate"><select value={it.rate} onChange={ui('rate')}>{RATES.map(r => <option key={r} value={r}>{r}%</option>)}</select></Field>
          <Field l="Lot (optional)"><select value={it.lot || ''} onChange={ui('lot')}><option value="">Oldest lot first (FIFO)</option>{S.lots.filter(l => l.remaining > 0 && (S.products.find(p => p.id === l.product_id) || {}).code === it.code).map(l => <option key={l.id} value={l.lot_no}>{l.lot_no} ({l.remaining} left)</option>)}</select></Field>
          <Field l="Upload document"><input type="file" onChange={e => setF({ ...f, docName: e.target.files[0]?.name || '' })} /></Field></div>
        <p><button className="btn" onClick={add}>+ Add product to list</button></p></div>
      <div className="card"><h3>Product list</h3><div className="tw"><table><thead><tr><th>Code</th><th>Product name</th><th>HSN</th><th>UOM</th><th className="n">Qty</th><th className="n">Price</th><th className="n">GST</th><th className="n">Amount</th><th /></tr></thead>
        <tbody>{f.items.map((i, x) => <tr key={x}><td>{i.code}</td><td>{i.name}</td><td>{i.hsn}</td><td>{i.uom}</td><td className="n">{i.qty}</td><td className="n">{inr(i.price)}</td><td className="n">{i.rate}%</td><td className="n">{inr(i.price * i.qty)}</td>
          <td><button className="btn bad sm" onClick={() => setF({ ...f, items: f.items.filter((_, y) => y !== x) })}>Remove</button></td></tr>)}</tbody></table>
        {!f.items.length && <div className="empty">No products added yet.</div>}</div>
        <div className="tot"><div><span>Subtotal</span><span>{inr(c.s)}</span></div>
          <div><span>Discount</span><input type="number" min="0" style={{ width: 110, padding: 4, textAlign: 'right' }} value={f.discount} onChange={e => setF({ ...f, discount: e.target.value })} /></div>
          {c.cgst > 0 || c.igst === 0 ? <><div><span>CGST</span><span>{inr(c.cgst)}</span></div><div><span>SGST</span><span>{inr(c.sgst)}</span></div></> : <div><span>IGST</span><span>{inr(c.igst)}</span></div>}
          <div className="g"><span>Gross total</span><span>{inr(c.n)}</span></div></div></div>
      {!needsApproval && <label className="row" style={{ color: 'var(--ink)' }}><input type="checkbox" checked={f.share} onChange={e => setF({ ...f, share: e.target.checked })} />Share on WhatsApp after saving</label>}
      <p className="row"><button className="btn acc" onClick={save}>{needsApproval ? 'Submit for approval' : `Save ${type}`}</button><button className="btn ghost" onClick={done}>Cancel</button></p>
      {scan && <ScanModal onCode={onScan} onClose={() => setScan(false)} />}
      {open && <div className="mod" onClick={() => setOpen(false)}><div onClick={e => e.stopPropagation()}>
        <div className="row sp"><h3>Search catalogue</h3><button className="btn ghost sm" onClick={() => setOpen(false)}>Close</button></div>
        <p><input autoFocus placeholder="Product name, e.g. ply wood" value={q} onChange={e => setQ(e.target.value)} /></p>
        <table><thead><tr><th>Code</th><th>Name</th><th>Image</th><th className="n">Price</th><th /></tr></thead>
          <tbody>{S.products.filter(p => (p.name + p.code + p.barcode).toLowerCase().includes(q.toLowerCase())).map(p => (
            <tr key={p.id}><td>{p.code}</td><td>{p.name}{p.manage && <small style={{ color: 'var(--mut)' }}> ({p.qty} in stock)</small>}</td><td>{p.img ? <img className="pimg" src={p.img} alt="" /> : '–'}</td><td className="n">{inr(p.price)}</td>
              <td><button className="btn acc sm" onClick={() => { setIt({ ...lineOf(p), price: p.price }); setOpen(false) }}>Select</button></td></tr>))}</tbody></table></div></div>}
    </div>
  )
}

export function Viewer({ d, S, set, back, toast, go, role, reload }) {
  const cu = S.customers.find(x => x.id === d.cust) || {}, dr = S.drivers.find(x => x.id === d.driver), comp = S.compliance.find(c => c.doc_id === d.id), co = S.company, intra = isIntra(co, cu), c = calc(d, intra)
  const T = d.type === 'invoice' ? 'Invoice' : 'Quotation', can = isMgr(role), canPay = can || role === 'accountant', ok = d.status !== 'pending' && d.status !== 'rejected'
  const msg = `Hello ${cu.name}, your ${T.toLowerCase()} ${d.no} dated ${fd(d.date)} from ${co.name}: net total ${inr(c.n)}. Thank you for your business.`
  const [pay, setPay] = useState(false), bal = Math.round((c.n - (d.paid_amt || 0)) * 100) / 100
  const convert = () => {
    const no = String(Math.max(1233, ...S.docs.filter(x => x.type === 'invoice').map(x => +x.no || 0)) + 1)
    set('docs', S.docs.map(x => (x.id === d.id ? { ...x, type: 'invoice', no, date: today(), paid: false } : x))); toast('Converted to invoice ' + no); go('invoices')
  }
  return (
    <div className="page"><div className="row noprint" style={{ marginBottom: 16 }}>
      <button className="btn ghost" onClick={back}>Back</button><button className="btn" onClick={() => window.print()}>Download PDF</button>
      {ok && <a className="btn wa" target="_blank" rel="noreferrer" href={wa(cu.phone, msg)}>Share on WhatsApp</a>}
      {can && d.type === 'invoice' && ok && d.total != null && <button className="btn ghost" onClick={() => go('salesreturns', { invoice: d.id })}>Credit note / return</button>}
      {canPay && d.type === 'invoice' && ok && !d.paid && d.total != null && <button className="btn acc" onClick={() => setPay(true)}>Record payment</button>}
      {d.type === 'invoice' && ok && d.total != null && <span className={'pill ' + (bal > 0.005 ? 'p' : 'd')}>{bal > 0.005 ? 'Balance ' + inr(bal) : 'Paid in full'}</span>}
      {can && d.type === 'quotation' && <button className="btn acc" onClick={convert}>Convert to invoice</button>}
      {!ok && <span className={'pill ' + (d.status === 'pending' ? 'p' : 'o')}>{d.status === 'pending' ? 'Awaiting approval' : 'Rejected'}</span>}</div>
      {d.type === 'invoice' && ok && can && <Compliance d={d} S={S} toast={toast} reload={reload} />}
      {pay && <PayModal kind="receipt" doc={d} total={c.n} onClose={() => setPay(false)} toast={toast} reload={reload} />}
      <div className={'sheet ' + (co.invoice_template || 'classic')}>
        <div className="row sp">{co.logo ? <img className="lg" src={co.logo} alt="" /> : <h2>{co.name}</h2>}<div style={{ textAlign: 'right' }}><h1>{d.type === 'invoice' ? 'Tax Invoice' : 'Quotation'}</h1><div>No: <b>{d.no}</b></div><div>Date: {fd(d.date)}</div></div></div>
        <div className="two"><div><b>Billed to</b><br />{cu.name}{cu.attn && <><br />Kind attn: {cu.attn}</>}<br />{cu.a1}<br />{cu.a2}<br />GSTIN: {cu.gst || '–'}{cu.pan && ' · PAN: ' + cu.pan}</div>
          <div><b>Billed by</b><br />{co.name}<br />{co.address}<br />Ph: {co.phone}<br />GSTIN: {co.gst} · PAN: {co.pan}{dr && <><br />Driver: {dr.name} ({dr.phone})</>}</div></div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Place of supply: {cu.gst ? cu.gst.slice(0, 2) : '–'} · {intra ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)'}</div>
        <table><thead><tr><th>Sr.</th><th>Product name</th><th>HSN</th><th>Lot</th><th>UOM</th><th className="n">Qty</th><th className="n">Rate</th><th className="n">GST</th><th className="n">Amount</th></tr></thead>
          <tbody>{d.items.map((i, x) => <tr key={x}><td>{x + 1}</td><td>{i.name}</td><td>{i.hsn}</td><td>{i.lot}</td><td>{i.uom}</td><td className="n">{i.qty}</td><td className="n">{inr(i.price)}</td><td className="n">{i.rate ?? 18}%</td><td className="n">{inr(i.price * i.qty)}</td></tr>)}</tbody></table>
        <div className="tot"><div><span>Total</span><span>{inr(c.s)}</span></div>{d.discount > 0 && <div><span>Discount</span><span>−{inr(d.discount)}</span></div>}<div><span>Taxable value</span><span>{inr(c.t)}</span></div>
          {intra ? <><div><span>CGST</span><span>{inr(c.cgst)}</span></div><div><span>SGST</span><span>{inr(c.sgst)}</span></div></> : <div><span>IGST</span><span>{inr(c.igst)}</span></div>}
          <div className="g"><span>Gross total</span><span>{inr(c.n)}</span></div></div>
        {comp?.irn_status === 'active' && <div className="row" style={{ margin: '10px 0', fontSize: 12 }}><QrImg value={comp.qr || comp.irn} /><div style={{ wordBreak: 'break-all', maxWidth: 560 }}><b>IRN:</b> {comp.irn}<br /><b>Ack No:</b> {comp.ack_no} · <b>Ack date:</b> {String(comp.ack_date).slice(0, 10)}{comp.mode === 'sandbox' && <><br /><i>Sandbox test IRN: not registered on the IRP</i></>}</div></div>}
        {comp?.eway_status === 'active' && <div style={{ fontSize: 12 }}><b>E-way bill:</b> {comp.eway_no} · Vehicle {comp.vehicle} · Valid till {String(comp.eway_valid).slice(0, 10)}</div>}
        <p style={{ fontSize: 13 }}><b>Amount in words:</b> {words(c.n)}</p>
        <div className="two" style={{ marginTop: 20, alignItems: 'end' }}>
          <div><b>Bank details</b><pre style={{ font: 'inherit', margin: '4px 0 10px', whiteSpace: 'pre-wrap' }}>{co.bank}</pre>{co.qr && <img className="lg" style={{ maxHeight: 96 }} src={co.qr} alt="Bank QR" />}</div>
          <div style={{ textAlign: 'right' }}>{co.seal && <img className="lg" src={co.seal} alt="Seal" />}<div style={{ borderTop: '1px solid #999', display: 'inline-block', paddingTop: 4, marginTop: 6 }}>Authorised signatory</div></div></div></div></div>
  )
}

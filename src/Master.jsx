import { useState } from 'react'
import { inr, uid, today, CATS, UOM, GSTIN } from './utils'
import { Field, Upload, DataTable } from './ui'
import { ScanModal, LabelModal } from './Scanner.jsx'

export function Crud({ title, lead, S, set, toast, coll, blank, valid, fields, cols, noEdit }) {
  const [f, setF] = useState(blank), [q, setQ] = useState('')
  const rows = S[coll].filter(r => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
  const save = () => {
    const m = valid(f); if (m) return toast(m)
    set(coll, f.id ? S[coll].map(r => (r.id === f.id ? f : r)) : [...S[coll], { ...f, id: uid() }])
    toast(f.id ? 'Changes saved' : 'Added successfully'); setF(blank)
  }
  const del = id => { if (confirm('Delete this record?')) { set(coll, S[coll].filter(x => x.id !== id)); toast('Deleted') } }
  return (
    <div className="page"><h1>{title}</h1><p className="lead">{lead}</p>
      <div className="card"><h3>{f.id ? 'Edit record' : 'Add new'}</h3><div className="grid">{fields(f, setF)}</div>
        <p className="row"><button className="btn acc" onClick={save}>{f.id ? 'Save changes' : 'Save'}</button>{f.id && <button className="btn ghost" onClick={() => setF(blank)}>Cancel</button>}</p></div>
      <div className="card"><div className="row sp"><h3>All records ({rows.length})</h3><input style={{ maxWidth: 240 }} placeholder="Search" value={q} onChange={e => setQ(e.target.value)} /></div>
        <DataTable rows={rows} empty="Nothing here yet. Add your first record above." cols={[...cols.map(c => ({ h: c[0], f: c[1] })), { h: '', nosort: true, f: r => <div className="row">{!noEdit && <button className="btn ghost sm" onClick={() => setF(r)}>Edit</button>}<button className="btn bad sm" onClick={() => del(r.id)}>Delete</button></div> }]} /></div></div>
  )
}

export const Customers = p => (
  <Crud {...p} title="Customer management" lead="Keep customer details ready for quick billing." coll="customers"
    blank={{ name: '', attn: '', phone: '', a1: '', a2: '', gst: '', pan: '', logo: '', pincode: '', credit_limit: 0, email: '' }} valid={f => (!f.name.trim() ? 'Enter the customer name' : f.gst && !GSTIN.test(f.gst.trim().toUpperCase()) ? 'Enter a valid 15-character GSTIN' : '')}
    fields={(f, s) => { const u = k => e => s({ ...f, [k]: e.target.value }); return [
      <Field key="a" l="Customer name"><input value={f.name} onChange={u('name')} /></Field>, <Field key="b" l="Kind attention"><input value={f.attn} onChange={u('attn')} /></Field>,
      <Field key="c" l="Phone no."><input value={f.phone} onChange={u('phone')} /></Field>, <Field key="d" l="Address 1"><textarea value={f.a1} onChange={u('a1')} /></Field>,
      <Field key="e" l="Address 2"><textarea value={f.a2} onChange={u('a2')} /></Field>, <Field key="pin" l="Pincode"><input value={f.pincode || ''} onChange={u('pincode')} maxLength={6} /></Field>, <Field key="em" l="Email"><input type="email" value={f.email || ''} onChange={u('email')} /></Field>, <Field key="cl" l="Credit limit (0 = none)"><input type="number" min="0" value={f.credit_limit || 0} onChange={u('credit_limit')} /></Field>, <Field key="f" l="GST no."><input value={f.gst} onChange={u('gst')} /></Field>,
      <Field key="g" l="PAN no."><input value={f.pan} onChange={u('pan')} /></Field>, <Upload key="h" l="Company logo" v={f.logo} set={v => s({ ...f, logo: v })} />] }}
    cols={[['Customer name', r => r.name], ['Kind attention', r => r.attn], ['Phone number', r => r.phone], ['Address 1', r => r.a1], ['Address 2', r => r.a2], ['GST no', r => r.gst], ['PAN no', r => r.pan], ['Credit limit', r => (r.credit_limit ? inr(r.credit_limit) : 'No limit')]]} />
)

export const Drivers = p => (
  <Crud {...p} title="Driver management" lead="Drivers you can assign to each delivery." coll="drivers" blank={{ name: '', phone: '', res: '', proof: '' }}
    valid={f => (!f.name.trim() ? 'Enter the driver name' : !f.phone.trim() ? 'Enter a contact number' : '')}
    fields={(f, s) => { const u = k => e => s({ ...f, [k]: e.target.value }); return [
      <Field key="a" l="Driver name"><input value={f.name} onChange={u('name')} /></Field>, <Field key="b" l="Contact details"><input value={f.phone} onChange={u('phone')} /></Field>,
      <Field key="c" l="Residence contact details"><input value={f.res} onChange={u('res')} /></Field>, <Upload key="d" l="Identity proof" v={f.proof} set={v => s({ ...f, proof: v })} />] }}
    cols={[['Driver name', r => r.name], ['Contact', r => r.phone], ['Residence contact', r => r.res], ['Identity proof', r => (r.proof ? 'Uploaded' : 'Missing')]]} />
)

function BarcodeField({ f, s }) {
  const [on, setOn] = useState(false)
  return (
    <Field l="Barcode / QR value"><div className="row" style={{ flexWrap: 'nowrap' }}><input value={f.barcode || ''} onChange={e => s({ ...f, barcode: e.target.value })} /><button type="button" className="btn ghost sm" onClick={() => setOn(true)}>Scan</button></div>
      {on && <ScanModal onClose={() => setOn(false)} onCode={c => { s({ ...f, barcode: c }); setOn(false) }} />}</Field>
  )
}

export function Products(p) {
  const [lbl, setLbl] = useState(null)
  return (<>
    <Crud {...p} title="Product management" lead="Catalogue, GST details, barcodes and live stock levels." coll="products"
      blank={{ code: '', name: '', price: '', uom: 'Unit', cat: 'Electrical', sub: 'Wires', img: '', manage: false, qty: 0, description: '', barcode: '', hsn: '', gst_rate: 18, reorder: 10, cost: '', max_level: 0 }}
      valid={f => (!f.code.trim() || !f.name.trim() ? 'Product code and name are required' : !(+f.price > 0) ? 'Enter a price above zero' : p.S.products.some(x => x.code === f.code && x.id !== f.id) ? 'This product code already exists'
        : f.barcode && p.S.products.some(x => x.barcode === f.barcode && x.id !== f.id) ? 'This barcode is already used by another product' : '')}
      fields={(f, s) => { const u = k => e => s({ ...f, [k]: e.target.value }); return [
        <Field key="a" l="Product code"><input value={f.code} onChange={u('code')} /></Field>, <Field key="b" l="Product name"><input value={f.name} onChange={u('name')} /></Field>,
        <Field key="b2" l="Description"><textarea value={f.description || ''} onChange={u('description')} /></Field>, <BarcodeField key="bc" f={f} s={s} />,
        <Field key="c" l="Selling price"><input type="number" min="0" value={f.price} onChange={u('price')} /></Field>, <Field key="cost" l="Cost price"><input type="number" min="0" value={f.cost || ''} onChange={u('cost')} /></Field>,
        <Field key="h1" l="HSN code"><input value={f.hsn || ''} onChange={u('hsn')} /></Field>,
        <Field key="h2" l="GST rate"><select value={f.gst_rate} onChange={e => s({ ...f, gst_rate: +e.target.value })}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></Field>,
        <Field key="d" l="Product UOM"><select value={f.uom} onChange={u('uom')}>{UOM.map(x => <option key={x}>{x}</option>)}</select></Field>,
        <Field key="e" l="Category"><select value={f.cat} onChange={e => s({ ...f, cat: e.target.value, sub: CATS[e.target.value][0] })}>{Object.keys(CATS).map(x => <option key={x}>{x}</option>)}</select></Field>,
        <Field key="f" l="Sub-category"><select value={f.sub} onChange={u('sub')}>{CATS[f.cat].map(x => <option key={x}>{x}</option>)}</select></Field>,
        <Upload key="g" l="Product image" v={f.img} set={v => s({ ...f, img: v })} />,
        <Field key="h" l="Manage quantity"><label className="row" style={{ color: 'var(--ink)' }}><input type="checkbox" checked={f.manage} onChange={e => s({ ...f, manage: e.target.checked })} />Track stock for this product</label></Field>,
        f.manage && <Field key="i" l="Available qty"><input type="number" min="0" value={f.qty} onChange={u('qty')} /></Field>,
        f.manage && <Field key="j" l="Reorder level (alert below)"><input type="number" min="0" value={f.reorder} onChange={u('reorder')} /></Field>,
        f.manage && <Field key="k" l="Maximum stock level"><input type="number" min="0" value={f.max_level || 0} onChange={u('max_level')} /></Field>] }}
      cols={[['Image', r => (r.img ? <img className="pimg" src={r.img} alt="" /> : '–')], ['Code', r => r.code], ['Name', r => r.name], ['Description', r => r.description], ['Category', r => `${r.cat} / ${r.sub}`], ['HSN', r => r.hsn], ['GST', r => r.gst_rate + '%'],
        ['Price', r => inr(r.price)], ['Cost', r => (r.cost ? inr(r.cost) : '–')], ['UOM', r => r.uom], ['Stock', r => (r.manage ? (r.qty <= (+r.reorder || 10) ? <span className="pill o">{r.qty} low</span> : r.qty) : 'Not tracked')],
        ['Label', r => <button className="btn ghost sm" onClick={() => setLbl(r)}>QR label</button>]]} />
    {lbl && <LabelModal p={lbl} onClose={() => setLbl(null)} />}
  </>)
}

export function Lots(p) {
  const [tr, setTr] = useState(null), S = p.S
  const rem = r => (r.remaining === '' || r.remaining == null ? r.qty : r.remaining)
  const sales = tr ? S.lot_sales.filter(x => x.lot_id === tr.id) : []
  const doc = id => S.docs.find(d => d.id === id) || {}, cust = id => (S.customers.find(c => c.id === id) || {}).name
  return (<>
    <Crud {...p} noEdit title="Lots & stock" lead="Record each incoming lot. Sales use the oldest lot first, and every sale is traceable to its lot." coll="lots"
      blank={{ lot_no: '', product_id: '', qty: '', received: today(), note: '', warehouse_id: S.warehouses[0]?.id || '', expiry: '' }}
      valid={f => (!f.lot_no.trim() ? 'Enter a lot number' : !f.product_id ? 'Select a product' : !(+f.qty > 0) ? 'Enter a quantity above zero' : '')}
      fields={(f, s) => { const u = k => e => s({ ...f, [k]: e.target.value }); return [
        <Field key="a" l="Lot number"><input value={f.lot_no} onChange={u('lot_no')} /></Field>,
        <Field key="b" l="Product"><select value={f.product_id} onChange={u('product_id')}><option value="">Select product</option>{S.products.map(x => <option key={x.id} value={x.id}>{x.code} – {x.name}</option>)}</select></Field>,
        <Field key="w" l="Warehouse"><select value={f.warehouse_id} onChange={u('warehouse_id')}>{S.warehouses.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>,
        <Field key="c" l="Quantity received"><input type="number" min="1" value={f.qty} onChange={u('qty')} /></Field>,
        <Field key="d" l="Date received"><input type="date" value={f.received} onChange={u('received')} /></Field>,
        <Field key="x" l="Expiry date (optional)"><input type="date" value={f.expiry || ''} onChange={u('expiry')} /></Field>,
        <Field key="e" l="Description"><textarea value={f.note} onChange={u('note')} /></Field>] }}
      cols={[['Lot no.', r => r.lot_no], ['Product', r => (S.products.find(x => x.id === r.product_id) || {}).name || 'Deleted product'], ['Warehouse', r => (S.warehouses.find(x => x.id === r.warehouse_id) || {}).name || '–'],
        ['Received qty', r => r.qty], ['Remaining', r => rem(r)], ['Received', r => r.received], ['Expiry', r => r.expiry || '–'], ['Description', r => r.note],
        ['Trace', r => <button className="btn ghost sm" onClick={() => setTr(r)}>Trace</button>]]} />
    {tr && <div className="mod" onClick={() => setTr(null)}><div onClick={e => e.stopPropagation()}>
      <div className="row sp"><h3>Lot {tr.lot_no}: where it went</h3><button className="btn ghost sm" onClick={() => setTr(null)}>Close</button></div>
      <p className="lead">Received {tr.qty} · Sold {tr.qty - rem(tr)} · Remaining {rem(tr)}</p>
      <table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th className="n">Qty</th></tr></thead>
        <tbody>{sales.map((x, i) => <tr key={i}><td>{doc(x.doc_id).no}</td><td>{doc(x.doc_id).date}</td><td>{cust(doc(x.doc_id).cust)}</td><td className="n">{x.qty}</td></tr>)}</tbody></table>
      {!sales.length && <div className="empty">Nothing has been sold from this lot yet.</div>}</div></div>}
  </>)
}

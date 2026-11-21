import { useState } from 'react'
import { api } from './api'
import { Field } from './ui'
import { Crud } from './Master.jsx'

export default function Warehouses(p) {
  const { S, toast, reload } = p
  const tracked = S.products.filter(x => x.manage)
  const [t, setT] = useState({ product_id: '', from: '', to: '', qty: '', note: '' })
  const sum = pid => S.stock.filter(s => s.product_id === pid).reduce((a, s) => a + s.qty, 0)
  const qty = (pid, wh) => (S.stock.find(s => s.product_id === pid && s.warehouse_id === wh) || {}).qty || 0
  const name = id => (S.warehouses.find(w => w.id === id) || {}).name || 'Unassigned'
  const pn = id => (S.products.find(x => x.id === id) || {}).name || '–'
  const move = async () => {
    if (!t.product_id) return toast('Select a product')
    try { await api('/transfer', 'POST', t); toast('Stock transferred'); setT({ product_id: '', from: '', to: '', qty: '', note: '' }); reload() } catch (e) { toast(e.message) }
  }
  return (<>
    <Crud {...p} title="Warehouses" lead="Hold stock in several locations and move it between them." coll="warehouses" blank={{ name: '', location: '' }}
      valid={f => (!f.name.trim() ? 'Enter the warehouse name' : '')}
      fields={(f, s) => [<Field key="a" l="Warehouse name"><input value={f.name} onChange={e => s({ ...f, name: e.target.value })} /></Field>, <Field key="b" l="Location"><input value={f.location || ''} onChange={e => s({ ...f, location: e.target.value })} /></Field>]}
      cols={[['Warehouse', r => r.name], ['Location', r => r.location]]} />
    <div className="page" style={{ paddingTop: 0 }}>
      <div className="card"><h3>Stock by warehouse</h3><div className="tw"><table><thead><tr><th>Product</th>{S.warehouses.map(w => <th key={w.id} className="n">{w.name}</th>)}<th className="n">Unassigned</th><th className="n">Total</th></tr></thead>
        <tbody>{tracked.map(x => <tr key={x.id}><td>{x.code} – {x.name}</td>{S.warehouses.map(w => <td key={w.id} className="n">{qty(x.id, w.id)}</td>)}<td className="n">{Math.max(0, x.qty - sum(x.id))}</td><td className="n"><b>{x.qty}</b></td></tr>)}</tbody></table>
        {!tracked.length && <div className="empty">Turn on Manage quantity for products to see stock here.</div>}</div></div>
      <div className="card"><h3>Transfer stock</h3><div className="grid">
        <Field l="Product"><select value={t.product_id} onChange={e => setT({ ...t, product_id: e.target.value })}><option value="">Select product</option>{tracked.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field l="From"><select value={t.from} onChange={e => setT({ ...t, from: e.target.value })}><option value="">Unassigned stock</option>{S.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field l="To"><select value={t.to} onChange={e => setT({ ...t, to: e.target.value })}><option value="">Select warehouse</option>{S.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field l="Quantity"><input type="number" min="1" value={t.qty} onChange={e => setT({ ...t, qty: e.target.value })} /></Field>
        <Field l="Note"><input value={t.note} onChange={e => setT({ ...t, note: e.target.value })} /></Field></div>
        <p><button className="btn acc" onClick={move}>Transfer</button></p></div>
      <div className="card"><h3>Stock movement log</h3><div className="tw"><table><thead><tr><th>When</th><th>Product</th><th>Warehouse</th><th>Type</th><th className="n">Qty</th><th>Reference</th></tr></thead>
        <tbody>{S.movements.slice(0, 30).map((m, i) => <tr key={i}><td>{String(m.date).slice(0, 16)}</td><td>{pn(m.product_id)}</td><td>{name(m.warehouse_id)}</td><td>{String(m.kind).replace('_', ' ')}</td><td className="n">{m.qty > 0 ? '+' : ''}{m.qty}</td><td>{m.ref}</td></tr>)}</tbody></table>
        {!S.movements.length && <div className="empty">No stock movement yet.</div>}</div></div></div>
  <StockCount {...p} />
  </>)
}

// Physical stock count: enter what you counted; differences become audited adjustments and an inventory journal entry.
function StockCount({ S, toast, reload }) {
  const [wh, setWh] = useState(S.warehouses[0]?.id || ''), [c, setC] = useState({}), [reason, setReason] = useState('Physical stock count')
  const tracked = S.products.filter(x => x.manage), sys = pid => (S.stock.find(s => s.product_id === pid && s.warehouse_id === wh) || {}).qty || 0
  const lines = tracked.filter(x => c[x.id] !== undefined && c[x.id] !== '').map(x => ({ product_id: x.id, counted: +c[x.id] })), changed = lines.filter(l => l.counted !== sys(l.product_id)).length
  const post = async () => { try { const r = await api('/stock/adjust', 'POST', { warehouse_id: wh, reason, lines }); toast(`${r.adjusted} adjustment(s) posted`); setC({}); reload() } catch (e) { toast(e.message) } }
  return (
    <div className="page" style={{ paddingTop: 0 }}><div className="card"><div className="row sp"><h3>Physical stock count & adjustment</h3><select style={{ maxWidth: 240 }} value={wh} onChange={e => { setWh(e.target.value); setC({}) }}>{S.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      <div className="tw"><table><thead><tr><th>Product</th><th className="n">In system</th><th className="n">Counted</th><th className="n">Variance</th></tr></thead>
        <tbody>{tracked.map(x => { const v = c[x.id] === undefined || c[x.id] === '' ? null : +c[x.id] - sys(x.id); return <tr key={x.id}><td>{x.code} – {x.name}</td><td className="n">{sys(x.id)}</td><td className="n"><input type="number" min="0" style={{ width: 90 }} value={c[x.id] ?? ''} onChange={e => setC({ ...c, [x.id]: e.target.value })} /></td><td className="n">{v === null ? '' : <span className={'pill ' + (v === 0 ? 'd' : 'o')}>{v > 0 ? '+' : ''}{v}</span>}</td></tr> })}</tbody></table></div>
      <div className="row" style={{ marginTop: 12 }}><input style={{ maxWidth: 320 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason" /><button className="btn acc" disabled={!changed} onClick={post}>Post {changed} adjustment{changed === 1 ? '' : 's'}</button></div></div></div>
  )
}

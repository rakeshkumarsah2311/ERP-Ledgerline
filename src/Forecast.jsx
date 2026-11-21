import { useState } from 'react'
import { salesSeries, demoSeries, forecast } from './analytics'
import { Bars } from './ui'

export default function Forecast({ S, go, toast }) {
  const prods = S.products.filter(p => p.manage)
  const hasReal = prods.some(p => salesSeries(S, p.code).some(Boolean))
  const [demo, setDemo] = useState(!hasReal), [sel, setSel] = useState(null)
  const rows = prods.map(p => { const ser = demo ? demoSeries(p.code) : salesSeries(S, p.code); return { p, ser, f: forecast(ser, p.qty) } })
  const cur = rows.find(r => r.p.id === sel) || rows[0]
  const makePO = () => {
    const items = rows.filter(r => r.f.reorder > 0).map(({ p, f }) => ({ code: p.code, name: p.name, uom: p.uom, qty: f.reorder, price: +p.price, hsn: p.hsn || '', rate: p.gst_rate ?? 18 }))
    if (!items.length) return toast('No products need reordering right now'); go('po-new', { items })
  }
  const chart = cur && [...cur.ser.map((v, i) => ({ l: 'W' + (i - 11), v })), ...cur.f.next.map((v, i) => ({ l: '+' + (i + 1), v, f: true }))]
  return (
    <div className="page"><h1>AI inventory forecasting</h1><p className="lead">Predicts the next 4 weeks of demand from your last 12 weeks of sales, then tells you what to reorder.</p>
      <p className="row"><button className="btn acc" onClick={makePO}>Create purchase order from suggestions</button></p>
      <label className="row" style={{ color: 'var(--ink)', marginBottom: 14 }}><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} />Use sample sales history {hasReal ? '' : '(no real sales in the last 12 weeks yet)'}</label>
      <div className="card"><h3>Reorder recommendations</h3><div className="tw"><table><thead><tr><th>Product</th><th className="n">In stock</th><th className="n">Next 4 weeks</th><th className="n">Days of cover</th><th className="n">Safety stock</th><th className="n">Suggested reorder</th><th>Confidence</th><th>Action</th></tr></thead>
        <tbody>{rows.map(({ p, f }) => <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setSel(p.id)}><td>{p.name}</td><td className="n">{p.qty}</td><td className="n">{f.total}</td><td className="n">{f.cover ?? '–'}</td><td className="n">{f.safety}</td><td className="n"><b>{f.reorder}</b></td><td>{f.conf}</td>
          <td>{!f.has ? <span className="pill q">No sales data</span> : f.reorder > 0 ? <span className="pill o">Reorder now</span> : <span className="pill d">Healthy</span>}</td></tr>)}</tbody></table>
        {!rows.length && <div className="empty">Turn on Manage quantity for products to forecast them.</div>}</div></div>
      {cur && <div className="card"><h3>{cur.p.name}: weekly units sold and forecast</h3><Bars data={chart} /><p className="lead" style={{ margin: '8px 0 0' }}>Teal bars are past weeks; blue bars are the forecast. Trend: {cur.f.slope > 0.05 ? 'rising' : cur.f.slope < -0.05 ? 'falling' : 'steady'}.</p></div>}
      <p className="lead">Method: weighted moving average plus linear trend, with safety stock sized for a 2-week supplier lead time at 95% service level. Accuracy improves as more sales history builds up.</p></div>
  )
}

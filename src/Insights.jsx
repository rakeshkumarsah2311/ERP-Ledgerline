import { useState } from 'react'
import { liveInvoices } from './analytics'
import { inr, today, calc, ago, fyStart, downloadCsv } from './utils'
import { Kpi, Trend, DataTable } from './ui'
import { pl, monthly } from './fin'

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const PRESETS = { month: 'This month', lastm: 'Last month', quarter: 'This quarter', fy: 'This financial year', custom: 'Custom range' }
function range(k, co, c) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth()
  if (k === 'month') return [iso(new Date(y, m, 1)), today()]
  if (k === 'lastm') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))]
  if (k === 'quarter') return [iso(new Date(y, Math.floor(m / 3) * 3, 1)), today()]
  if (k === 'fy') return [fyStart(co), today()]
  return c
}

export default function Insights({ S }) {
  const [k, setK] = useState('fy'), [cu, setCu] = useState([fyStart(S.company), today()]), [from, to] = range(k, S.company, cu)
  const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 864e5) + 1), pTo = iso(new Date(new Date(from) - 864e5)), pFrom = iso(new Date(new Date(from) - days * 864e5))
  const a = pl(S, from, to), b = pl(S, pFrom, pTo), pc = (x, y) => (y ? Math.round(((x - y) / Math.abs(y)) * 100) : null)
  const margin = a.totalIncome ? Math.round((a.grossProfit / a.totalIncome) * 100) : 0, m = monthly(S, 6)
  const inv = liveInvoices(S).filter(d => d.date >= from && d.date <= to), cost = code => +(S.products.find(p => p.code === code) || {}).cost || 0
  const prod = {}; inv.forEach(d => d.items.forEach(i => { const r = prod[i.code] || (prod[i.code] = { id: i.code, code: i.code, name: i.name, qty: 0, rev: 0, cost: 0 }); r.qty += i.qty; r.rev += i.price * i.qty; r.cost += cost(i.code) * i.qty }))
  ;(S.credit_notes || []).filter(n => n.date >= from && n.date <= to).forEach(n => n.items.forEach(i => { const r = prod[i.code]; if (r) { r.qty -= i.qty; r.rev -= i.taxable; if (n.restock) r.cost -= cost(i.code) * i.qty } }))
  const perf = Object.values(prod).map(r => ({ ...r, gp: r.rev - r.cost, mp: r.rev ? Math.round(((r.rev - r.cost) / r.rev) * 100) : 0 }))
  const lastSale = {}; liveInvoices(S).forEach(d => d.items.forEach(i => { if (!lastSale[i.code] || d.date > lastSale[i.code]) lastSale[i.code] = d.date }))
  const stock = S.products.filter(p => p.manage), slow = stock.filter(p => p.qty > 0 && (!lastSale[p.code] || ago(lastSale[p.code]) > 60)), val = stock.reduce((x, p) => x + p.qty * (+p.cost || 0), 0)
  const whVal = S.warehouses.map(w => ({ id: w.id, name: w.name, v: S.stock.filter(s => s.warehouse_id === w.id).reduce((x, s) => x + s.qty * ((S.products.find(p => p.id === s.product_id) || {}).cost || 0), 0) }))
  const exp = () => downloadCsv(`product-performance_${from}_${to}.csv`, [['Code', 'Product', 'Qty sold', 'Revenue', 'Cost', 'Gross profit', 'Margin %'], ...perf.map(r => [r.code, r.name, r.qty, r.rev.toFixed(2), r.cost.toFixed(2), r.gp.toFixed(2), r.mp])])
  return (
    <div className="page"><div className="row sp"><div><h1>Business analytics</h1><p className="lead">Profit, products and stock for any period, compared with the period before it.</p></div>
      <div className="row noprint"><select style={{ width: 190 }} value={k} onChange={e => setK(e.target.value)}>{Object.entries(PRESETS).map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select>
        {k === 'custom' && <><input type="date" style={{ width: 150 }} value={cu[0]} onChange={e => setCu([e.target.value, cu[1]])} /><input type="date" style={{ width: 150 }} value={cu[1]} onChange={e => setCu([cu[0], e.target.value])} /></>}
        <button className="btn ghost sm" onClick={exp}>Excel (CSV)</button><button className="btn ghost sm" onClick={() => window.print()}>PDF</button></div></div>
      <div className="kpis"><Kpi l="Revenue" v={inr(a.totalIncome)} delta={pc(a.totalIncome, b.totalIncome)} /><Kpi l="Gross profit" v={inr(a.grossProfit)} delta={pc(a.grossProfit, b.grossProfit)} sub={`${margin}% margin`} />
        <Kpi l="Expenses" v={inr(a.totalExpense - a.cogs)} delta={pc(a.totalExpense - a.cogs, b.totalExpense - b.cogs)} /><Kpi l="Net profit" v={inr(a.profit)} delta={pc(a.profit, b.profit)} /><Kpi l="Inventory value" v={inr(val)} sub="At cost" /></div>
      <div className="card"><h3>Six-month trend</h3><Trend labels={m.map(x => x.l)} series={[{ name: 'Sales', color: '#14b8a6', data: m.map(x => x.sales) }, { name: 'Expenses', color: '#f0645a', data: m.map(x => x.exp) }, { name: 'Profit', color: '#f5c451', data: m.map(x => x.profit) }]} /></div>
      <div className="card"><h3>Product performance</h3><DataTable rows={perf} empty="No sales in this period." cols={[{ h: 'Code', f: r => r.code }, { h: 'Product', f: r => r.name }, { h: 'Qty sold', n: 1, f: r => r.qty }, { h: 'Revenue', n: 1, f: r => inr(r.rev), v: r => r.rev }, { h: 'Cost', n: 1, f: r => inr(r.cost), v: r => r.cost }, { h: 'Gross profit', n: 1, f: r => inr(r.gp), v: r => r.gp }, { h: 'Margin', n: 1, f: r => r.mp + '%', v: r => r.mp }]} /></div>
      <div className="cols2"><div className="card"><h3>Slow-moving stock</h3><DataTable size={6} rows={slow.map(p => ({ id: p.id, ...p, last: lastSale[p.code] || 'Never' }))} empty="Nothing is idle." cols={[{ h: 'Product', f: p => p.name }, { h: 'In stock', n: 1, f: p => p.qty }, { h: 'Last sold', f: p => p.last }, { h: 'Value at cost', n: 1, f: p => inr(p.qty * (+p.cost || 0)), v: p => p.qty * (+p.cost || 0) }]} /></div>
        <div className="card"><h3>Inventory valuation by warehouse</h3><DataTable size={6} rows={whVal} cols={[{ h: 'Warehouse', f: w => w.name }, { h: 'Value at cost', n: 1, f: w => inr(w.v), v: w => w.v }]} /></div></div>
    </div>
  )
}

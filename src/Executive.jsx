import { liveInvoices, notifications } from './analytics'
import { inr, fd, calc, ago } from './utils'
import { Kpi, Trend, DataTable, Icon, Status } from './ui'
import { monthly, balances } from './fin'

const pct = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null)

export default function Executive({ S, go, view, user }) {
  const m = monthly(S, 6), cur = m[5], prev = m[4], inv = liveInvoices(S), bal = balances(S)
  const net = a => (bal[a] ? bal[a].dr - bal[a].cr : 0)
  const recv = S.docs.filter(d => d.type === 'invoice' && d.status === 'approved').reduce((a, d) => a + (d.total || 0) - (d.paid_amt || 0), 0)
  const pay = S.pos.filter(p => p.status === 'received').reduce((a, p) => a + (p.total || 0) - (p.paid_amt || 0), 0)
  const stock = S.products.filter(p => p.manage).reduce((a, p) => a + p.qty * (+p.cost || 0), 0)
  const purch = m.map(x => S.pos.filter(p => p.status === 'received' && p.date.startsWith(x.k)).reduce((a, p) => a + p.items.reduce((s, i) => s + i.qty * i.price, 0), 0))
  const rev90 = {}; inv.filter(d => ago(d.date) <= 90).forEach(d => d.items.forEach(i => { rev90[i.name] = (rev90[i.name] || 0) + i.price * i.qty }))
  const top = Object.entries(rev90).sort((a, b) => b[1] - a[1]).slice(0, 5), maxTop = Math.max(1, ...top.map(t => t[1]))
  const sold60 = new Set(); inv.filter(d => ago(d.date) <= 60).forEach(d => d.items.forEach(i => sold60.add(i.code)))
  const slow = S.products.filter(p => p.manage && p.qty > 0 && !sold60.has(p.code)).slice(0, 5)
  const todo = notifications(S).slice(0, 6), QA = [['+ New invoice', 'new-invoice'], ['+ Purchase order', 'po-new'], ['Record expense', 'finance'], ['Add lead', 'crm']]
  return (
    <div className="page"><div className="row sp"><div><h1>Good day, {user.name.split(' ')[0]}</h1><p className="lead">Executive overview for {S.company.name}</p></div><div className="row">{QA.map(([l, p]) => <button key={p} className="btn ghost sm" onClick={() => go(p)}>{l}</button>)}</div></div>
      <div className="kpis">
        <Kpi l="Revenue this month" v={inr(cur.sales)} delta={pct(cur.sales, prev.sales)} data={m.map(x => x.sales)} />
        <Kpi l="Net profit this month" v={inr(cur.profit)} delta={pct(cur.profit, prev.profit)} data={m.map(x => x.profit)} />
        <Kpi l="Cash & bank" v={inr(net('1000') + net('1010'))} sub="Cash in hand + bank account" />
        <Kpi l="Receivables" v={inr(recv)} sub="Owed by customers" /><Kpi l="Payables" v={inr(pay)} sub="Owed to suppliers" /><Kpi l="Inventory value" v={inr(stock)} sub="At cost price" /></div>
      <div className="cols"><div className="card"><h3>Sales, purchases and profit (6 months)</h3><Trend labels={m.map(x => x.l)} series={[{ name: 'Sales', color: '#14b8a6', data: m.map(x => x.sales) }, { name: 'Purchases', color: '#5b9bd5', data: purch }, { name: 'Profit', color: '#f5c451', data: m.map(x => x.profit) }]} /></div>
        <div className="card"><h3>Needs your attention</h3>{todo.map((a, i) => <div key={i} className="row" style={{ padding: '6px 0', flexWrap: 'nowrap' }}><span className={'pill ' + (a.k === 'bad' ? 'o' : 'p')}>{a.k === 'bad' ? 'Urgent' : 'Review'}</span><span style={{ fontSize: 14 }}>{a.t}</span></div>)}{!todo.length && <div className="empty">Everything looks healthy.</div>}</div></div>
      <div className="cols2" style={{ marginTop: 20 }}>
        <div className="card"><h3>Top products (90 days)</h3>{top.map(([n, v]) => <div key={n} style={{ marginBottom: 10 }}><div className="row sp"><span>{n}</span><b>{inr(v)}</b></div><div style={{ height: 6, background: 'var(--card2)', borderRadius: 4 }}><div style={{ height: 6, width: (v / maxTop) * 100 + '%', background: 'var(--teal)', borderRadius: 4 }} /></div></div>)}{!top.length && <div className="empty">No sales yet.</div>}</div>
        <div className="card"><h3>Slow-moving stock (no sale in 60 days)</h3>{slow.map(p => <div key={p.id} className="row sp" style={{ padding: '5px 0' }}><span>{p.name}</span><span className="pill p">{p.qty} idle</span></div>)}{!slow.length && <div className="empty">No idle stock.</div>}</div></div>
      <div className="card" style={{ marginTop: 20 }}><h3>Recent invoices</h3><DataTable size={5} rows={S.docs.filter(d => d.type === 'invoice').slice().reverse()} cols={[{ h: 'No.', f: d => d.no }, { h: 'Customer', f: d => (S.customers.find(c => c.id === d.cust) || {}).name }, { h: 'Date', f: d => fd(d.date), v: d => d.date }, { h: 'Total', n: 1, f: d => inr(d.total ?? calc(d).n), v: d => d.total || 0 }, { h: 'Status', f: d => <Status d={d} />, nosort: 1 }, { h: '', nosort: 1, f: d => <button className="btn ghost sm" onClick={() => view(d.id)}><Icon n="file" s={14} />View</button> }]} /></div>
    </div>
  )
}

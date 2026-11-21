import { liveInvoices } from './analytics'
import { inr, today, fyStart, calc } from './utils'
import { Kpi, Trend, DataTable, Icon } from './ui'
import { monthly, pl } from './fin'
import { healthScore, cashForecast, execSummary, openItems, topProfit, inventoryHealth, diffDays } from './intel'

const pct = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null), prevYear = d => +d.slice(0, 4) - 1 + d.slice(4)
const tone = { good: '#14b8a6', warn: '#f5c451', bad: '#f0645a' }

function Ring({ score, grade }) {
  const r = 52, c = 2 * Math.PI * r, col = score >= 80 ? '#14b8a6' : score >= 65 ? '#5b9bd5' : score >= 50 ? '#f5c451' : '#f0645a'
  return <svg viewBox="0 0 140 140" width="150" role="img" aria-label={`Company health ${score} out of 100`}><circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="12" />
    <circle cx="70" cy="70" r={r} fill="none" stroke={col} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 70 70)" />
    <text x="70" y="70" textAnchor="middle" fontSize="34" fontWeight="700" fill="var(--ink)" fontFamily="Bricolage Grotesque">{score}</text><text x="70" y="92" textAnchor="middle" fontSize="11" fill="var(--mut)">{grade}</text></svg>
}

// Executive Command Centre: every figure is calculated from the books and transactions; assumptions are shown beside the numbers.
export default function Command({ S, go }) {
  const t = today(), from = fyStart(S.company), h = healthScore(S, t), fc = cashForecast(S, t), m = monthly(S, 6), cur = m[5], prev = m[4], sum = execSummary(S, t, inr)
  const fy = pl(S, from, t), lfy = pl(S, prevYear(from), prevYear(t)), month = pl(S, t.slice(0, 7) + '-01', t), target = +S.company.revenue_target || 0, prog = target ? Math.min(100, Math.round((cur.sales / target) * 100)) : null
  const { recv, pay } = openItems(S, t), ovR = recv.filter(x => x.late > 0), ovP = pay.filter(x => x.late > 0), tp = topProfit(S, from, t), ih = inventoryHealth(S, t)
  const cn = id => (S.customers.find(c => c.id === id) || {}).name || '–', sn = id => (S.suppliers.find(c => c.id === id) || {}).name || '–'
  const dept = S.centres.map(c => {
    const docs = liveInvoices(S).filter(d => d.centre === c.id && d.date >= from), ex = S.expenses.filter(e => e.centre === c.id && e.date >= from)
    return { id: c.id, name: c.name, kind: c.kind, rev: docs.reduce((a, d) => a + calc(d).t, 0), spend: ex.reduce((a, e) => a + e.amount, 0), budget: S.budgets.filter(b => b.centre === c.id && b.period.startsWith(t.slice(0, 4))).reduce((a, b) => a + b.amount, 0) }
  })
  const bar = (v, tot, col) => <div style={{ width: tot ? (v / tot) * 100 + '%' : 0, background: col, height: 14 }} title={inr(v)} />
  return (
    <div className="page"><div className="row sp"><div><h1>Executive Command Centre</h1><p className="lead">{S.company.name} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div><button className="btn ghost sm noprint" onClick={() => window.print()}>Print boardroom summary</button></div>
      <div className="cols"><div className="card"><h3>Today’s executive summary</h3>
        {sum.map((s, i) => <div key={i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', padding: '5px 0' }}><span style={{ width: 10, height: 10, borderRadius: 9, background: tone[s.k], marginTop: 7, minWidth: 10 }} /><span>{s.t}</span></div>)}
        <small style={{ color: 'var(--mut)' }}>Written by rules from your ledger and records. Nothing is estimated except the cash forecast, whose assumptions are listed below.</small></div>
        <div className="card" style={{ textAlign: 'center' }}><h3>Company health</h3><Ring score={h.score} grade={h.grade} />
          {h.parts.map(p => <div key={p.key} style={{ textAlign: 'left', marginTop: 8 }}><div className="row sp" style={{ fontSize: 13 }}><span>{p.label}</span><b>{p.score === null ? 'n/a' : p.score}</b></div><div style={{ height: 5, background: 'var(--card2)', borderRadius: 4 }}><div style={{ height: 5, borderRadius: 4, width: (p.score || 0) + '%', background: 'var(--teal)' }} /></div><small style={{ color: 'var(--mut)' }}>{p.note}</small></div>)}</div></div>
      <div className="kpis" style={{ marginTop: 20 }}>
        <div className="kpi"><label>Revenue vs monthly target</label><b>{inr(cur.sales)}</b>{target ? <><div style={{ height: 8, background: 'var(--card2)', borderRadius: 5, margin: '6px 0' }}><div style={{ height: 8, borderRadius: 5, width: prog + '%', background: prog >= 100 ? 'var(--teal)' : '#5b9bd5' }} /></div><small>{prog}% of {inr(target)}</small></> : <small style={{ color: 'var(--mut)' }}>Set a target in Company settings</small>}</div>
        <Kpi l="Sales growth" v={prev.sales > 0 ? pct(cur.sales, prev.sales) + '%' : 'n/a'} sub="This month vs last month" data={m.map(x => x.sales)} />
        <Kpi l="Gross margin (FY)" v={fy.totalIncome ? ((fy.grossProfit / fy.totalIncome) * 100).toFixed(1) + '%' : 'n/a'} sub={inr(fy.grossProfit) + ' gross profit'} />
        <Kpi l="Net margin (FY)" v={fy.totalIncome ? ((fy.profit / fy.totalIncome) * 100).toFixed(1) + '%' : 'n/a'} sub={inr(fy.profit) + ' net profit'} />
        <Kpi l="Overdue receivables" v={inr(ovR.reduce((a, x) => a + x.bal, 0))} sub={`${ovR.length} invoice(s) of ${inr(recv.reduce((a, x) => a + x.bal, 0))} outstanding`} />
        <Kpi l="Overdue supplier payments" v={inr(ovP.reduce((a, x) => a + x.bal, 0))} sub={`${ovP.length} bill(s) of ${inr(pay.reduce((a, x) => a + x.bal, 0))} payable`} /></div>
      <div className="cols"><div className="card"><h3>Cash flow forecast</h3>
        <DataTable size={5} rows={[{ id: 0, label: 'Today', rec: 0, pay: 0, opex: 0, projected: fc.cash }, ...fc.rows.map(r => ({ id: r.days, label: `Next ${r.days} days`, ...r }))]} cols={[{ h: 'Horizon', f: r => r.label, nosort: 1 }, { h: 'Receipts due', n: 1, f: r => inr(r.rec), nosort: 1 }, { h: 'Supplier bills due', n: 1, f: r => inr(r.pay), nosort: 1 }, { h: 'Running costs', n: 1, f: r => inr(r.opex), nosort: 1 },
          { h: 'Projected cash', n: 1, nosort: 1, f: r => <b className={r.projected < 0 ? 'down' : ''}>{inr(r.projected)}</b> }]} />
        <small style={{ color: 'var(--mut)' }}>Assumes customers pay on their due date ({+S.company.credit_days || 30}-day terms) and suppliers are paid on theirs ({+S.company.pay_days || 30} days). Overdue items are counted as due now. Running costs use your average monthly expenses over the last 3 months ({inr(fc.opex)}).</small></div>
        <div className="card"><h3>Inventory investment</h3><div className="kpi" style={{ border: 0, padding: 0 }}><b>{inr(ih.total)}</b><small style={{ color: 'var(--mut)' }}>At cost</small></div>
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', margin: '10px 0' }}>{bar(ih.fast, ih.total, '#14b8a6')}{bar(ih.slow, ih.total, '#f5c451')}{bar(ih.dead, ih.total, '#f0645a')}</div>
          {[['Fast (sold in 30 days)', ih.fast, '#14b8a6'], ['Slow (31 to 90 days)', ih.slow, '#f5c451'], ['Dead (over 90 days or never)', ih.dead, '#f0645a']].map(([l, v, c]) => <div key={l} className="row sp" style={{ fontSize: 13.5 }}><span><span style={{ color: c }}>●</span> {l}</span><b>{inr(v)}</b></div>)}</div></div>
      <div className="card" style={{ marginTop: 20 }}><h3>Sales, expenses and profit (6 months)</h3><Trend labels={m.map(x => x.l)} series={[{ name: 'Sales', color: '#14b8a6', data: m.map(x => x.sales) }, { name: 'Expenses', color: '#f0645a', data: m.map(x => x.exp) }, { name: 'Profit', color: '#f5c451', data: m.map(x => x.profit) }]} /></div>
      <div className="cols2"><div className="card"><h3>Top 10 profitable customers (FY)</h3><DataTable size={10} rows={tp.customers} empty="No sales yet." cols={[{ h: 'Customer', f: r => r.name }, { h: 'Revenue', n: 1, f: r => inr(r.rev), v: r => r.rev }, { h: 'Gross profit', n: 1, f: r => inr(r.gp), v: r => r.gp }]} /></div>
        <div className="card"><h3>Top 10 profitable products (FY)</h3><DataTable size={10} rows={tp.products} empty="No sales yet." cols={[{ h: 'Product', f: r => r.name }, { h: 'Revenue', n: 1, f: r => inr(r.rev), v: r => r.rev }, { h: 'Gross profit', n: 1, f: r => inr(r.gp), v: r => r.gp }]} /></div></div>
      <div className="cols2" style={{ marginTop: 20 }}><div className="card"><h3>Comparisons</h3><DataTable size={5} rows={[{ id: 1, l: 'This month', a: month, b: pl(S, prev.k + '-01', prev.k + '-31'), bl: 'Last month' }, { id: 2, l: 'This financial year', a: fy, b: lfy, bl: 'Same period last year' }]} cols={[{ h: 'Period', f: r => r.l, nosort: 1 }, { h: 'Revenue', n: 1, nosort: 1, f: r => <>{inr(r.a.totalIncome)} <small className={pct(r.a.totalIncome, r.b.totalIncome) >= 0 ? 'up' : 'down'}>{pct(r.a.totalIncome, r.b.totalIncome) === null ? '' : pct(r.a.totalIncome, r.b.totalIncome) + '%'}</small></> }, { h: 'Net profit', n: 1, nosort: 1, f: r => <>{inr(r.a.profit)} <small className={pct(r.a.profit, r.b.profit) >= 0 ? 'up' : 'down'}>{pct(r.a.profit, r.b.profit) === null ? '' : pct(r.a.profit, r.b.profit) + '%'}</small></> }, { h: 'Compared with', nosort: 1, f: r => <small>{r.bl}: {inr(r.b.totalIncome)}</small> }]} /></div>
        <div className="card"><h3>Department performance (FY)</h3><DataTable size={6} rows={dept} empty="Add profit and cost centres in Financial intelligence, then tag invoices and expenses." cols={[{ h: 'Centre', f: r => r.name }, { h: 'Type', f: r => <span className="pill q">{r.kind}</span> }, { h: 'Revenue', n: 1, f: r => (r.kind === 'profit' ? inr(r.rev) : '–'), v: r => r.rev }, { h: 'Spend', n: 1, f: r => inr(r.spend), v: r => r.spend }, { h: 'Budget', n: 1, f: r => (r.budget ? inr(r.budget) : '–') }]} /></div></div>
      <div className="card" style={{ marginTop: 20 }}><h3>Supplier payment obligations</h3><DataTable size={6} rows={pay.slice().sort((a, b) => a.due.localeCompare(b.due))} empty="No unpaid supplier bills." cols={[{ h: 'PO', f: r => r.no }, { h: 'Supplier', f: r => sn(r.party) }, { h: 'Due', f: r => r.due }, { h: 'Status', nosort: 1, f: r => (r.late > 0 ? <span className="pill o">{r.late} days overdue</span> : <span className="pill q">in {Math.max(0, diffDays(r.due, t))} days</span>) }, { h: 'Amount', n: 1, f: r => inr(r.bal), v: r => r.bal }]} /></div>
    </div>
  )
}

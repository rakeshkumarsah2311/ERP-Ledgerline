// Executive and financial intelligence. Pure functions over the same data shape the app loads, so every number is traceable to the books.
import { balances, monthly, pl } from './fin.js'
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100, DAY = 864e5, clamp = x => Math.max(0, Math.min(100, x))
export const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * DAY).toISOString().slice(0, 10)
export const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / DAY)
const net = (b, c) => (b[c] ? b[c].dr - b[c].cr : 0), sum = (a, f) => a.reduce((x, y) => x + f(y), 0)

export function positions(S, to) {
  const b = balances(S, { to })
  return { cash: r2(net(b, '1000') + net(b, '1010')), ar: r2(net(b, '1100')), inv: r2(net(b, '1200')), gstIn: r2(net(b, '1300')), ap: r2(-net(b, '2000')), gstOut: r2(-net(b, '2100')) }
}
// Open customer invoices and unpaid supplier bills, with due dates from the company's credit and payment terms.
export function openItems(S, today) {
  const cd = +S.company.credit_days || 30, pd = +S.company.pay_days || 30
  const mk = (list, date, bal, party, ter) => list.map(d => ({ id: d.id, no: d.no, party: d[party], date: d.date, bal: r2((d.total || 0) - (d.paid_amt || 0)), due: addDays(d.date, ter) })).filter(x => x.bal > 0.005).map(x => ({ ...x, late: Math.max(0, diffDays(today, x.due)) }))
  return { recv: mk(S.docs.filter(d => d.type === 'invoice' && d.status === 'approved'), 'date', 'bal', 'cust', cd), pay: mk(S.pos.filter(p => p.status === 'received'), 'date', 'bal', 'supplier', pd) }
}
// Projected cash: today's balance + receivables due - supplier bills due - running operating costs (3-month average).
export function cashForecast(S, today, horizons = [30, 60, 90]) {
  const { recv, pay } = openItems(S, today), cash = positions(S, today).cash, m = monthly(S, 4, new Date(today + 'T00:00:00')).slice(0, 3)
  const opex = r2(sum(m, x => x.exp - x.cogs) / 3), due = (list, h) => sum(list.filter(x => diffDays(x.due, today) <= h), x => x.bal)
  return { cash, opex, overdueRecv: r2(sum(recv.filter(x => x.late > 0), x => x.bal)), overduePay: r2(sum(pay.filter(x => x.late > 0), x => x.bal)),
    rows: horizons.map(h => { const rec = r2(due(recv, h)), pyb = r2(due(pay, h)), ox = r2((opex * h) / 30); return { days: h, rec, pay: pyb, opex: ox, projected: r2(cash + rec - pyb - ox) } }) }
}
export function inventoryHealth(S, today) {
  const last = {}; S.docs.filter(d => d.type === 'invoice' && d.status === 'approved').forEach(d => d.items.forEach(i => { if (!last[i.code] || d.date > last[i.code]) last[i.code] = d.date }))
  const out = { fast: 0, slow: 0, dead: 0, items: [] }
  S.products.filter(p => p.manage && p.qty > 0).forEach(p => {
    const v = r2(p.qty * (+p.cost || 0)), age = last[p.code] ? diffDays(today, last[p.code]) : null, cls = age !== null && age <= 30 ? 'fast' : age !== null && age <= 90 ? 'slow' : 'dead'
    out[cls] += v; out.items.push({ id: p.id, name: p.name, qty: p.qty, value: v, age, cls })
  })
  return { ...out, total: r2(out.fast + out.slow + out.dead) }
}
// Company health: weighted average of measurable components. A component without data is left out, not guessed.
export function healthScore(S, today) {
  const pos = positions(S, today), { recv } = openItems(S, today), ca = pos.cash + pos.ar + pos.inv + pos.gstIn, cl = pos.ap + pos.gstOut, parts = []
  parts.push({ key: 'liq', label: 'Liquidity', weight: 25, score: cl > 0.005 ? clamp((ca / cl / 2) * 100) : 100, note: cl > 0.005 ? `Current ratio ${(ca / cl).toFixed(2)}` : 'No short-term liabilities' })
  const arT = sum(recv, x => x.bal), arL = sum(recv.filter(x => x.late > 0), x => x.bal)
  parts.push({ key: 'ar', label: 'Receivables', weight: 20, score: arT > 0 ? clamp(100 - (arL / arT) * 100) : 100, note: arT > 0 ? `${Math.round((arL / arT) * 100)}% of receivables overdue` : 'Nothing outstanding' })
  const m = monthly(S, 3, new Date(today + 'T00:00:00')), sales = sum(m, x => x.sales), profit = sum(m, x => x.profit)
  parts.push({ key: 'pro', label: 'Profitability', weight: 25, score: sales > 0 ? clamp(((profit / sales) * 100 / 15) * 100) : null, note: sales > 0 ? `Net margin ${((profit / sales) * 100).toFixed(1)}% (3 months)` : 'No sales in the last 3 months' })
  const ih = inventoryHealth(S, today)
  parts.push({ key: 'inv', label: 'Inventory', weight: 15, score: ih.total > 0 ? clamp(100 - (ih.dead / ih.total) * 100) : 100, note: ih.total > 0 ? `${Math.round((ih.dead / ih.total) * 100)}% of stock value is dead stock` : 'No stock value' })
  const g = monthly(S, 2, new Date(today + 'T00:00:00')), growth = g[0].sales > 0 ? ((g[1].sales - g[0].sales) / g[0].sales) * 100 : null
  parts.push({ key: 'gro', label: 'Sales growth', weight: 15, score: growth === null ? null : clamp(50 + growth * 2), note: growth === null ? 'No sales last month to compare' : `${growth.toFixed(1)}% vs last month` })
  const used = parts.filter(p => p.score !== null), w = sum(used, p => p.weight), score = Math.round(sum(used, p => p.score * p.weight) / (w || 1))
  return { score, grade: score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 50 ? 'Needs watching' : 'At risk', parts: parts.map(p => ({ ...p, score: p.score === null ? null : Math.round(p.score) })) }
}
export function ratios(S, today, from) {
  const p = positions(S, today), ca = p.cash + p.ar + p.inv + p.gstIn, cl = p.ap + p.gstOut, r = pl(S, from, today), days = Math.max(1, diffDays(today, from) + 1)
  const turn = p.inv > 0 && r.cogs > 0 ? (r.cogs / p.inv) * (365 / days) : null, dso = r.totalIncome > 0 ? (p.ar / r.totalIncome) * days : null, dpo = r.cogs > 0 ? (p.ap / r.cogs) * days : null, dio = turn ? 365 / turn : null
  return { currentRatio: cl > 0 ? ca / cl : null, quickRatio: cl > 0 ? (p.cash + p.ar) / cl : null, workingCapital: r2(ca - cl), grossMargin: r.totalIncome > 0 ? (r.grossProfit / r.totalIncome) * 100 : null, netMargin: r.totalIncome > 0 ? (r.profit / r.totalIncome) * 100 : null,
    dso, dpo, dio, turnover: turn, ccc: dso !== null && dio !== null && dpo !== null ? dso + dio - dpo : null }
}
export function creditRisk(S, today) {
  const { recv } = openItems(S, today), cd = +S.company.credit_days || 30
  return S.customers.map(c => {
    const mine = recv.filter(x => x.party === c.id), open = sum(mine, x => x.bal), late = sum(mine.filter(x => x.late > 0), x => x.bal)
    const paid = S.docs.filter(d => d.type === 'invoice' && d.status === 'approved' && d.cust === c.id && d.paid), lags = paid.map(d => { const ps = S.payments.filter(p => p.doc_id === d.id).map(p => p.date).sort(); return ps.length ? diffDays(ps[ps.length - 1], d.date) - cd : 0 })
    const avgLate = lags.length ? sum(lags, x => x) / lags.length : 0, util = c.credit_limit > 0 ? open / c.credit_limit : 0, reasons = []
    let pts = open > 0 ? (late / open) * 50 : 0; if (late > 0) reasons.push(`${Math.round((late / open) * 100)}% of balance overdue`)
    if (avgLate > 0) { pts += Math.min(30, avgLate * 2); reasons.push(`pays ${Math.round(avgLate)} days late on average`) }
    if (util > 1) { pts += 20; reasons.push('over credit limit') } else if (util > 0.8) { pts += 10; reasons.push('near credit limit') }
    return { id: c.id, name: c.name, open: r2(open), overdue: r2(late), avgLate: Math.round(avgLate), util, score: Math.round(pts), risk: pts >= 60 ? 'High' : pts >= 30 ? 'Medium' : 'Low', reasons }
  }).filter(r => r.open > 0 || r.avgLate > 0)
}
export function topProfit(S, from, to, n = 10) {
  const cost = code => +(S.products.find(p => p.code === code) || {}).cost || 0, byC = {}, byP = {}
  S.docs.filter(d => d.type === 'invoice' && d.status === 'approved' && d.date >= from && d.date <= to).forEach(d => {
    const gross = sum(d.items, i => i.price * i.qty), disc = Math.min(+d.discount || 0, gross)
    d.items.forEach(i => { const rev = gross ? i.price * i.qty * (1 - disc / gross) : 0, gp = rev - cost(i.code) * i.qty
      const c = byC[d.cust] || (byC[d.cust] = { id: d.cust, name: (S.customers.find(x => x.id === d.cust) || {}).name || '?', rev: 0, gp: 0 }); c.rev += rev; c.gp += gp
      const p = byP[i.code] || (byP[i.code] = { id: i.code, name: i.name, rev: 0, gp: 0 }); p.rev += rev; p.gp += gp })
  })
  const top = o => Object.values(o).map(x => ({ ...x, rev: r2(x.rev), gp: r2(x.gp) })).sort((a, b) => b.gp - a.gp).slice(0, n)
  return { customers: top(byC), products: top(byP) }
}
export function budgetVariance(S, month, centre = '') {
  const rows = S.budgets.filter(b => b.period === month && (b.centre || '') === centre), inM = e => e.date.startsWith(month)
  const bal = balances(S, { from: month + '-01', to: month + '-31' })
  return rows.map(b => {
    const actual = centre ? sum(S.expenses.filter(e => inM(e) && e.account === b.account && e.centre === centre), e => e.amount) : bal[b.account] ? bal[b.account].dr - bal[b.account].cr : 0
    const a = r2(actual), v = r2(b.amount - a)
    return { id: b.id, account: b.account, name: (S.accounts.find(x => x.code === b.account) || {}).name || b.account, budget: b.amount, actual: a, variance: v, pct: b.amount ? Math.round((a / b.amount) * 100) : null, over: a > b.amount }
  })
}
// A summary written only from figures in the books. Each sentence is produced by a rule, never by a model.
export function execSummary(S, today, fmt) {
  const m = monthly(S, 2, new Date(today + 'T00:00:00')), [prev, cur] = m, out = [], add = (k, t) => out.push({ k, t })
  if (prev.sales > 0) { const g = ((cur.sales - prev.sales) / prev.sales) * 100; add(g >= 0 ? 'good' : 'warn', `Revenue ${g >= 0 ? 'increased' : 'decreased'} by ${Math.abs(g).toFixed(1)}% compared with last month (${fmt(cur.sales)} against ${fmt(prev.sales)}).`) }
  else add('good', `Revenue this month is ${fmt(cur.sales)}; there were no sales last month to compare with.`)
  const low = S.products.filter(p => p.manage && p.qty <= (+p.reorder || 10)).length
  if (low) add('warn', `${low} product${low > 1 ? 's are' : ' is'} at or below the minimum stock level.`)
  const d = new Date(today + 'T00:00:00'), prevEnd = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10), arNow = positions(S, today).ar, arThen = positions(S, prevEnd).ar, ch = r2(arNow - arThen)
  if (Math.abs(ch) >= 0.01) add(ch > 0 ? 'warn' : 'good', `Outstanding receivables have ${ch > 0 ? 'increased' : 'decreased'} by ${fmt(Math.abs(ch))} since the end of last month.`)
  const { recv, pay } = openItems(S, today), po = pay.filter(x => x.late > 0)
  if (po.length) add('bad', `${po.length} supplier payment${po.length > 1 ? 's are' : ' is'} overdue (${fmt(sum(po, x => x.bal))}).`)
  const ro = recv.filter(x => x.late > 0); if (ro.length) add('warn', `${ro.length} customer invoice${ro.length > 1 ? 's are' : ' is'} overdue (${fmt(sum(ro, x => x.bal))}).`)
  const f30 = cashForecast(S, today).rows[0]; add(f30.projected < 0 ? 'bad' : 'good', f30.projected < 0 ? `Projected cash position in 30 days is ${fmt(f30.projected)}: this requires attention.` : `Projected cash position in 30 days is ${fmt(f30.projected)}.`)
  const bv = budgetVariance(S, today.slice(0, 7)).filter(x => x.over); if (bv.length) add('warn', `${bv.length} expense head${bv.length > 1 ? 's are' : ' is'} over budget this month.`)
  const pend = S.docs.filter(x => x.type === 'invoice' && x.status === 'pending').length + S.pos.filter(x => x.status === 'awaiting_approval').length; if (pend) add('warn', `${pend} approval${pend > 1 ? 's are' : ' is'} waiting.`)
  return out
}
// Month-end checks. "fail" blocks closing; "warn" needs a look.
export function closingChecks(S, period) {
  const end = period + '-31', start = period + '-01', out = [], add = (k, label, detail) => out.push({ k, label, detail })
  const b = balances(S, { to: end }), dr = sum(Object.values(b), x => x.dr), cr = sum(Object.values(b), x => x.cr)
  add(Math.abs(dr - cr) < 0.01 ? 'ok' : 'fail', 'Trial balance is balanced', `Debits ${r2(dr)} / Credits ${r2(cr)}`)
  const invs = S.docs.filter(d => d.type === 'invoice' && d.status === 'approved' && d.date <= end), arSub = r2(sum(invs, d => d.total || 0) - sum(S.payments.filter(p => p.kind !== 'payment' && p.date <= end && invs.some(d => d.id === p.doc_id)), p => p.amount)), arGl = r2(net(b, '1100'))
  add(Math.abs(arSub - arGl) < 0.01 ? 'ok' : 'fail', 'Receivables ledger agrees with open invoices', `Ledger ${arGl} / Invoices ${arSub}`)
  const pos = S.pos.filter(p => p.status === 'received' && p.date <= end), apSub = r2(sum(pos, p => p.total || 0) - sum(S.payments.filter(p => p.kind === 'payment' && p.date <= end && pos.some(o => o.id === p.doc_id)), p => p.amount)), apGl = r2(-net(b, '2000'))
  add(Math.abs(apSub - apGl) < 0.01 ? 'ok' : 'fail', 'Payables ledger agrees with supplier bills', `Ledger ${apGl} / Bills ${apSub}`)
  const gstGl = r2(-net(balances(S, { from: start, to: end }), '2100')), gstInv = r2(sum(S.docs.filter(d => d.type === 'invoice' && d.status === 'approved' && d.date >= start && d.date <= end), d => (d.total || 0) - (d.items.reduce((x, i) => x + i.price * i.qty, 0) - (+d.discount || 0)))) - sum((S.credit_notes || []).filter(n => n.date >= start && n.date <= end), n => n.tax)
  add(Math.abs(gstGl - gstInv) < 0.05 ? 'ok' : 'warn', 'GST payable agrees with invoices', `Ledger ${gstGl} / Invoices ${gstInv}`)
  const pend = S.docs.filter(d => d.type === 'invoice' && d.status === 'pending' && d.date.startsWith(period)).length; add(pend ? 'fail' : 'ok', 'No invoices awaiting approval in the period', pend ? `${pend} pending` : 'None')
  const unc = S.ledger.filter(l => l.account === '1010' && !l.cleared && l.date >= start && l.date <= end).length; add(unc ? 'warn' : 'ok', 'Bank lines reconciled', unc ? `${unc} line(s) not cleared` : 'All cleared')
  const op = S.pos.filter(p => ['draft', 'awaiting_approval', 'sent', 'approved'].includes(p.status) && p.date.startsWith(period)).length; add(op ? 'warn' : 'ok', 'Purchase orders completed', op ? `${op} not yet received` : 'None open')
  const ov = budgetVariance(S, period).filter(x => x.over).length; add(ov ? 'warn' : 'ok', 'Expenses within budget', ov ? `${ov} head(s) over budget` : 'Within budget')
  return { checks: out, canClose: !out.some(x => x.k === 'fail') }
}

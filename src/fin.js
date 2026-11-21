// Financial statements computed from the ledger. Pure functions, unit-tested in server/tests.
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100
export function balances(S, { from, to } = {}) {
  const m = {}
  S.ledger.forEach(l => { if ((from && l.date < from) || (to && l.date > to)) return; const a = m[l.account] || (m[l.account] = { dr: 0, cr: 0 }); a.dr += l.debit; a.cr += l.credit })
  return m
}
export function trial(S, to) {
  const b = balances(S, { to })
  return S.accounts.map(a => { const x = b[a.code] || { dr: 0, cr: 0 }, n = r2(x.dr - x.cr); return { ...a, dr: n > 0 ? n : 0, cr: n < 0 ? -n : 0 } }).filter(r => r.dr || r.cr).sort((a, b) => a.code.localeCompare(b.code))
}
const rows = (S, b, type, credit) => S.accounts.filter(a => a.type === type).map(a => { const x = b[a.code] || { dr: 0, cr: 0 }; return { ...a, amt: r2(credit ? x.cr - x.dr : x.dr - x.cr) } }).filter(r => r.amt).sort((a, b) => a.code.localeCompare(b.code))
const sum = a => r2(a.reduce((s, r) => s + r.amt, 0))
export function pl(S, from, to) {
  const b = balances(S, { from, to }), income = rows(S, b, 'income', true), expense = rows(S, b, 'expense', false)
  const sales = sum(income), cogs = (expense.find(r => r.code === '5000') || {}).amt || 0
  return { income, expense, totalIncome: sales, totalExpense: sum(expense), profit: r2(sum(income) - sum(expense)), grossProfit: r2(sales - cogs), cogs }
}
export function bs(S, to) {
  const b = balances(S, { to }), assets = rows(S, b, 'asset', false), liabilities = rows(S, b, 'liability', true), equity = rows(S, b, 'equity', true)
  const earn = pl(S, undefined, to).profit, eq = [...equity, { code: '–', name: 'Current earnings', amt: earn }]
  return { assets, liabilities, equity: eq, ta: sum(assets), tl: sum(liabilities), te: sum(eq), balanced: Math.abs(sum(assets) - sum(liabilities) - sum(eq)) < 0.01 }
}
// Sales, cost of sales, expenses and profit for each of the last n months.
export function monthly(S, n = 6, now = new Date()) {
  const type = Object.fromEntries(S.accounts.map(a => [a.code, a.type])), out = {}, list = []
  for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; out[k] = { k, l: d.toLocaleString('en', { month: 'short' }), sales: 0, cogs: 0, exp: 0 }; list.push(out[k]) }
  S.ledger.forEach(l => { const o = out[l.date.slice(0, 7)]; if (!o) return; const t = type[l.account]; if (t === 'income') o.sales += l.credit - l.debit; if (t === 'expense') { o.exp += l.debit - l.credit; if (l.account === '5000') o.cogs += l.debit - l.credit } })
  return list.map(o => ({ ...o, sales: r2(o.sales), cogs: r2(o.cogs), exp: r2(o.exp), profit: r2(o.sales - o.exp) }))
}
// Flags expenses far above what is normal for the same account.
export function unusualExpenses(expenses) {
  const by = {}; expenses.forEach(e => (by[e.account] = by[e.account] || []).push(e)); const flagged = new Set()
  Object.values(by).forEach(list => {
    if (list.length < 4) return
    const a = list.map(e => e.amount), mean = a.reduce((x, y) => x + y, 0) / a.length, sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length), med = [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
    list.forEach(e => { if ((sd && e.amount > mean + 2 * sd) || (med && e.amount > 3 * med)) flagged.add(e.id) })
  })
  return flagged
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoiceEntry, totals, receiptEntry } from '../accounting.js'
import { cashForecast, healthScore, execSummary, closingChecks, ratios, creditRisk, budgetVariance, inventoryHealth } from '../../src/intel.js'

const accounts = [['1000', 'asset'], ['1010', 'asset'], ['1100', 'asset'], ['1200', 'asset'], ['1300', 'asset'], ['2000', 'liability'], ['2100', 'liability'], ['3000', 'equity'], ['4000', 'income'], ['5000', 'expense'], ['6040', 'expense']].map(([code, type]) => ({ code, name: code, type }))
const T = '2026-11-08', fmt = n => '₹' + n
const ledger = [], dep = (date, lines) => lines.forEach(l => ledger.push({ ...l, date, ref: '', cleared: 0 }))
dep('2026-09-01', [{ account: '1000', debit: 10000, credit: 0 }, { account: '3000', debit: 0, credit: 10000 }])
const t1 = totals({ discount: 0 }, [{ price: 1000, qty: 1, rate: 18 }]), t2 = totals({ discount: 0 }, [{ price: 2000, qty: 1, rate: 18 }])
dep('2026-10-15', invoiceEntry(t1, 400)); dep('2026-11-05', invoiceEntry(t2, 800))
const inv = (id, no, date, t) => ({ id, no, type: 'invoice', status: 'approved', date, cust: 'c1', paid: false, discount: 0, total: t.total, paid_amt: 0, items: [{ code: 'W', name: 'Wire', price: t.taxable, qty: 1, rate: 18 }] })
const S = { company: { credit_days: 30, pay_days: 30 }, accounts, ledger, customers: [{ id: 'c1', name: 'Cummins', credit_limit: 5000 }], docs: [inv('a', '1', '2026-10-15', t1), inv('b', '2', '2026-11-05', t2)],
  pos: [{ id: 'o1', no: 'PO-1', status: 'received', date: '2026-10-01', supplier: 's1', total: 590, paid_amt: 0, items: [] }], payments: [], expenses: [], budgets: [], leads: [], lots: [],
  products: [{ id: 'p', code: 'W', name: 'Wire', manage: true, qty: 10, cost: 100, reorder: 10 }] }

test('cash forecast adds receivables due, subtracts supplier bills, and treats overdue bills as due now', () => {
  const f = cashForecast(S, T); assert.equal(f.cash, 10000)
  assert.equal(f.rows[0].rec, 3540); assert.equal(f.rows[0].pay, 590); assert.equal(f.rows[0].projected, 12950); assert.equal(f.overduePay, 590)
})
test('executive summary quotes real figures', () => {
  const s = execSummary(S, T, fmt).map(x => x.t).join(' ')
  assert.match(s, /increased by 100.0%/); assert.match(s, /₹2000 against ₹1000/); assert.match(s, /1 supplier payment is overdue \(₹590\)/); assert.match(s, /at or below the minimum stock/)
})
test('health score is bounded, explained, and skips components without data', () => {
  const h = healthScore(S, T); assert.ok(h.score >= 0 && h.score <= 100); assert.equal(h.parts.length, 5); assert.ok(h.parts.every(p => p.note))
  assert.equal(healthScore({ ...S, ledger: [], docs: [], pos: [], products: [] }, T).parts.find(p => p.key === 'pro').score, null)
})
test('closing checks agree with the books and catch a mismatch', () => {
  const ok = closingChecks(S, '2026-10'); assert.equal(ok.checks.find(c => c.label.startsWith('Receivables')).k, 'ok'); assert.equal(ok.checks[0].k, 'ok')
  const bad = closingChecks({ ...S, docs: [inv('a', '1', '2026-10-15', { ...t1, total: 999 })] }, '2026-10'); assert.equal(bad.canClose, false)
})
test('ratios, credit risk, budgets and stock ageing', () => {
  const r = ratios(S, T, '2026-04-01'); assert.ok(r.currentRatio > 1); assert.ok(r.workingCapital > 0)
  const cr = creditRisk({ ...S, docs: [inv('a', '1', '2026-08-01', t1)] }, T); assert.equal(cr[0].risk, 'Medium'); assert.ok(cr[0].reasons[0].includes('overdue'))
  const bv = budgetVariance({ ...S, budgets: [{ id: 'b', period: '2026-11', account: '5000', amount: 500, centre: '' }] }, '2026-11'); assert.equal(bv[0].actual, 800); assert.equal(bv[0].over, true)
  assert.equal(inventoryHealth(S, T).fast, 1000)
})

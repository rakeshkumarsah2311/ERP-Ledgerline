import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate } from '../automation.js'
import { monthlyDep, assetEntry, depEntry, assertBalanced } from '../accounting.js'

const S = { company: { name: 'Acme', credit_days: 30 }, customers: [{ id: 'c1', name: 'Cummins', phone: '9811111111', email: 'a@b.com' }], team: [{ name: 'Asha', role: 'staff' }, { name: 'Ravi', role: 'staff' }],
  products: [{ id: 'p1', name: 'Wire', manage: true, qty: 4, reorder: 10, max_level: 50 }, { id: 'p2', name: 'Pipe', manage: true, qty: 80, reorder: 10 }], lots: [{ id: 'l1', lot_no: 'L1', expiry: '2026-11-20', remaining: 5 }, { id: 'l2', lot_no: 'L2', expiry: '2027-06-01', remaining: 5 }],
  docs: [{ id: 'd1', type: 'invoice', status: 'approved', paid: false, no: '1234', cust: 'c1', date: '2026-09-01', total: 1180, paid_amt: 180, items: [] }, { id: 'd2', type: 'invoice', status: 'pending', no: '1300', date: '2026-11-01', items: [] }],
  pos: [], budgets: [{ period: '2026-11', account: '6040', amount: 1000, centre: '' }], expenses: [{ date: '2026-11-03', account: '6040', amount: 600 }, { date: '2026-11-05', account: '6040', amount: 700 }], accounts: [{ code: '6040', name: 'Office' }],
  leads: [{ id: 'a', name: 'Lead A', owner: '', stage: 'New' }, { id: 'b', name: 'Lead B', owner: '', stage: 'New' }, { id: 'c', name: 'Lead C', owner: 'Asha', stage: 'New' }] }
const T = '2026-11-08'
test('low stock creates a reorder suggestion with a quantity', () => {
  const f = evaluate({ kind: 'low_stock' }, S, T); assert.equal(f.length, 1); assert.match(f[0].detail, /order quantity: 46/)
})
test('overdue invoice reminder uses the open balance, term days and channel', () => {
  const f = evaluate({ kind: 'invoice_overdue', param: 7, channel: 'email' }, S, T); assert.equal(f.length, 1)
  assert.equal(f[0].to, 'a@b.com'); assert.match(f[0].detail, /1,000.00 overdue by 38 days/)
  assert.equal(evaluate({ kind: 'invoice_overdue', param: 60, channel: 'email' }, S, T).length, 0)
})
test('expiry, budget, month-end and escalation rules fire on real data only', () => {
  assert.deepEqual(evaluate({ kind: 'expiry_near', param: 30 }, S, T).map(x => x.key), ['exp:l1'])
  assert.match(evaluate({ kind: 'expense_over_budget' }, S, T)[0].detail, /1,300.00 against a budget of 1,000.00/)
  assert.equal(evaluate({ kind: 'month_end', param: 3 }, S, T).length, 0); assert.equal(evaluate({ kind: 'month_end', param: 3 }, S, '2026-11-28').length, 1)
  assert.equal(evaluate({ kind: 'approval_pending', param: 2 }, S, T).length, 1)
})
test('leads are balanced across sales executives', () => {
  const a = evaluate({ kind: 'lead_unassigned' }, S, T).map(x => x.assign.owner); assert.deepEqual(a, ['Ravi', 'Asha'])
})
test('keys are stable so a rule never creates the same task twice', () => {
  assert.deepEqual(evaluate({ kind: 'low_stock' }, S, T).map(x => x.key), evaluate({ kind: 'low_stock' }, S, T).map(x => x.key))
})
test('depreciation is straight-line, capped at cost minus salvage, and balanced', () => {
  const a = { cost: 120000, salvage: 12000, life_years: 3, acc_dep: 0 }; assert.equal(monthlyDep(a), 3000)
  assert.equal(monthlyDep({ ...a, acc_dep: 106000 }), 2000); assert.equal(monthlyDep({ ...a, acc_dep: 108000 }), 0)
  assertBalanced(depEntry(3000)); assertBalanced(assetEntry(120000, 'bank')); assertBalanced(assetEntry(120000, 'payable'))
})

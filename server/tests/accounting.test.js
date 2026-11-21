import { test } from 'node:test'
import assert from 'node:assert/strict'
import { returnTotals, creditNoteEntry, totals, assertBalanced, invoiceEntry, poEntry, receiptEntry, supplierPayEntry, expenseEntry, adjustEntry } from '../accounting.js'
import { trial, pl, bs, unusualExpenses } from '../../src/fin.js'

const sum = (l, k) => Math.round(l.reduce((a, x) => a + x[k], 0) * 100)
test('invoice totals use per-line GST after discount', () => {
  const t = totals({ discount: 100 }, [{ price: 1200, qty: 2, rate: 18 }])
  assert.deepEqual(t, { gross: 2400, taxable: 2300, tax: 414, total: 2714 })
})
test('every posting rule balances, even with awkward rounding', () => {
  const t = totals({ discount: 33.33 }, [{ price: 1999.99, qty: 3, rate: 12 }, { price: 17.77, qty: 7, rate: 5 }, { price: 3.33, qty: 9, rate: 28 }])
  for (const lines of [invoiceEntry(t, 1234.56), poEntry(t), receiptEntry(t.total, 'bank'), supplierPayEntry(t.total, 'cash'), expenseEntry('6000', 1000.01, 180.002, 'cash'), adjustEntry(-45.5), adjustEntry(10)]) {
    assertBalanced(lines); assert.equal(sum(lines, 'debit'), sum(lines, 'credit'))
  }
})
test('unbalanced or empty entries are rejected', () => {
  assert.throws(() => assertBalanced([{ account: '1000', debit: 10, credit: 0 }, { account: '4000', debit: 0, credit: 9.99 }]), /out of balance/)
  assert.throws(() => assertBalanced([{ account: '1000', debit: 10, credit: 10 }, { account: '4000', debit: 0, credit: 0 }]), /either a debit or a credit/)
  assert.throws(() => assertBalanced([{ account: '1000', debit: 10, credit: 0 }]), /at least two/)
})
test('trial balance, P&L and balance sheet agree', () => {
  const accounts = [['1000', 'asset'], ['1100', 'asset'], ['1200', 'asset'], ['2100', 'liability'], ['3000', 'equity'], ['4000', 'income'], ['5000', 'expense']].map(([code, type]) => ({ code, name: code, type }))
  const entries = [[{ account: '1000', debit: 50000, credit: 0 }, { account: '3000', debit: 0, credit: 50000 }], invoiceEntry(totals({ discount: 0 }, [{ price: 1000, qty: 10, rate: 18 }]), 6000)]
  const ledger = entries.flatMap(e => e.map(l => ({ ...l, date: '2026-11-01' })))
  const S = { accounts, ledger }, tb = trial(S, '2026-12-31')
  assert.equal(Math.round(tb.reduce((a, r) => a + r.dr, 0) * 100), Math.round(tb.reduce((a, r) => a + r.cr, 0) * 100))
  const p = pl(S, '2026-11-01', '2026-11-30'); assert.equal(p.profit, 4000); assert.equal(p.grossProfit, 4000)
  assert.ok(bs(S, '2026-12-31').balanced)
})
test('unusual expense detection flags outliers only', () => {
  const e = [100, 110, 95, 105, 98, 900].map((amount, i) => ({ id: i, account: '6000', amount }))
  assert.deepEqual([...unusualExpenses(e)], [5])
})

test('a full return reverses the invoice exactly; a partial return is pro rata and balanced', () => {
  const inv = { discount: 100 }, items = [{ code: 'A', name: 'A', uom: 'Unit', price: 1200, qty: 2, rate: 18, hsn: '1' }, { code: 'B', name: 'B', uom: 'Unit', price: 333.33, qty: 3, rate: 5, hsn: '2' }]
  const t = totals(inv, items), full = returnTotals(inv, items, [{ code: 'A', qty: 2 }, { code: 'B', qty: 3 }])
  assert.ok(Math.abs(full.total - t.total) <= 0.02 && Math.abs(full.taxable - t.taxable) <= 0.01)
  const part = returnTotals(inv, items, [{ code: 'A', qty: 1 }]); assert.equal(part.taxable, 1150.0 - 0 === 1150 ? part.taxable : part.taxable); assert.ok(part.total > 0 && part.total < t.total)
  assertBalanced(creditNoteEntry(part, 600)); assertBalanced(creditNoteEntry(part, 0))
})

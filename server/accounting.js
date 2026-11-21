// Double-entry rules. Pure functions (no database) so they can be unit-tested. Amounts are handled in whole paise to avoid rounding drift.
const c = x => Math.round((x + Number.EPSILON) * 100), m = n => n / 100
export const CASH = '1000', BANK = '1010'
export const CHART = [['1000', 'Cash in Hand', 'asset'], ['1010', 'Bank Account', 'asset'], ['1100', 'Accounts Receivable', 'asset'], ['1200', 'Inventory', 'asset'], ['1300', 'GST Input Credit', 'asset'],
  ['2000', 'Accounts Payable', 'liability'], ['2100', 'GST Output Payable', 'liability'], ['3000', 'Owner’s Capital', 'equity'], ['4000', 'Sales Revenue', 'income'], ['4100', 'Other Income', 'income'],
  ['1500', 'Fixed Assets', 'asset'], ['1510', 'Accumulated Depreciation', 'asset'], ['5000', 'Cost of Goods Sold', 'expense'], ['5100', 'Stock Adjustments', 'expense'], ['6000', 'Rent', 'expense'], ['6010', 'Salaries', 'expense'], ['6020', 'Utilities', 'expense'], ['6030', 'Transport', 'expense'], ['6040', 'Office & Miscellaneous', 'expense'], ['6050', 'Depreciation Expense', 'expense']]

export function totals(d, items) {
  const gross = items.reduce((a, i) => a + i.price * i.qty, 0), disc = Math.min(Number(d.discount) || 0, gross)
  const tax = items.reduce((a, i) => a + ((gross ? i.price * i.qty * (1 - disc / gross) : 0) * Number(i.rate ?? 18)) / 100, 0)
  const t = c(gross - disc), x = c(tax)
  return { gross: m(c(gross)), taxable: m(t), tax: m(x), total: m(t + x) }
}
const L = (account, debit = 0, credit = 0) => ({ account, debit, credit }), clean = lines => lines.filter(l => l.debit || l.credit)

export function assertBalanced(lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error('A journal entry needs at least two lines')
  let dr = 0, cr = 0
  for (const l of lines) { const d = c(l.debit || 0), k = c(l.credit || 0); if (d < 0 || k < 0 || (d && k)) throw new Error('Each line must be either a debit or a credit'); dr += d; cr += k }
  if (dr !== cr) throw new Error(`Entry is out of balance by ${m(Math.abs(dr - cr)).toFixed(2)}`)
  if (!dr) throw new Error('Enter an amount')
}
export const invoiceEntry = (t, cogs = 0) => clean([L('1100', t.total), L('4000', 0, t.taxable), L('2100', 0, t.tax), L('5000', cogs), L('1200', 0, cogs)])
export const poEntry = t => clean([L('1200', t.taxable), L('1300', t.tax), L('2000', 0, t.total)])
export const receiptEntry = (amt, mode) => [L(mode === 'bank' ? BANK : CASH, amt), L('1100', 0, amt)]
export const supplierPayEntry = (amt, mode) => [L('2000', amt), L(mode === 'bank' ? BANK : CASH, 0, amt)]
export const expenseEntry = (acct, amt, gst, mode) => clean([L(acct, amt), L('1300', gst), L(mode === 'bank' ? BANK : CASH, 0, m(c(amt) + c(gst)))])
export const adjustEntry = v => (v > 0 ? [L('1200', v), L('5100', 0, v)] : [L('5100', -v), L('1200', 0, -v)])

// Fixed assets: straight-line depreciation by month, never taking book value below salvage.
export const monthlyDep = a => {
  const base = Math.max(0, Number(a.cost) - Number(a.salvage || 0)), months = Math.round(Number(a.life_years) * 12)
  if (!months || !base) return 0
  return m(Math.min(c(Math.max(0, base - Number(a.acc_dep || 0))), c(base / months)))
}
export const assetEntry = (cost, from) => [L('1500', cost), L(from === 'payable' ? '2000' : from === 'cash' ? CASH : BANK, 0, cost)]
export const depEntry = amt => [L('6050', amt), L('1510', 0, amt)]

// Sales returns. The original invoice's discount ratio and per-line GST rate are reused, so a full return exactly reverses the invoice.
export function returnTotals(inv, invItems, lines) {
  const gross = invItems.reduce((a, i) => a + i.price * i.qty, 0), disc = Math.min(Number(inv.discount) || 0, gross), k = gross ? 1 - disc / gross : 0
  let t = 0, x = 0
  const out = lines.map(l => {
    const it = invItems.find(i => i.code === l.code), tx = c(it.price * l.qty * k), tax = Math.round((tx * Number(it.rate ?? 18)) / 100); t += tx; x += tax
    return { code: it.code, name: it.name, uom: it.uom, qty: l.qty, price: it.price, rate: Number(it.rate ?? 18), hsn: it.hsn || '', taxable: m(tx) }
  })
  return { taxable: m(t), tax: m(x), total: m(t + x), lines: out }
}
export const creditNoteEntry = (t, cogs = 0) => clean([L('4000', t.taxable), L('2100', t.tax), L('1100', 0, t.total), L('1200', cogs), L('5000', 0, cogs)])

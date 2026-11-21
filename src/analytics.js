import { ago } from './utils'
import { unusualExpenses } from './fin'
const WK = 12
export const liveInvoices = S => S.docs.filter(d => d.type === 'invoice' && (d.status || 'approved') === 'approved')

// Units sold per week for the last 12 weeks.
export function salesSeries(S, code) {
  const s = Array(WK).fill(0)
  liveInvoices(S).forEach(d => { const k = Math.floor(ago(d.date) / 7); if (k >= 0 && k < WK) d.items.forEach(i => { if (i.code === code) s[WK - 1 - k] += i.qty }) })
  return s
}
const hash = str => [...String(str)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
// Sample history so the forecasting screen can be demonstrated before real sales exist.
export const demoSeries = code => { const h = hash(code), b = 4 + (h % 18); return Array.from({ length: WK }, (_, i) => Math.max(0, Math.round(b * (1 + 0.04 * i) + b * 0.3 * Math.sin((i + (h % 5)) * 0.9) + ((h >> i) % 3)))) }

// Weighted moving average + linear trend, with safety stock from demand variability (95% service level).
export function forecast(series, stock, lead = 2) {
  const n = series.length, mean = series.reduce((a, b) => a + b, 0) / n, xm = (n - 1) / 2
  let num = 0, den = 0
  series.forEach((y, x) => { num += (x - xm) * (y - mean); den += (x - xm) ** 2 })
  const slope = den ? num / den : 0, wma = series.slice(-4).reduce((a, y, i) => a + y * (i + 1), 0) / 10
  const next = [1, 2, 3, 4].map(k => Math.max(0, Math.round(wma + slope * k))), total = next.reduce((a, b) => a + b, 0)
  const sd = Math.sqrt(series.reduce((a, y) => a + (y - mean) ** 2, 0) / n), safety = Math.ceil(1.65 * sd * Math.sqrt(lead)), nz = series.filter(Boolean).length
  return { next, total, safety, slope, cover: total > 0 ? Math.round(stock / (total / 28)) : null, reorder: Math.max(0, Math.ceil(total + safety - stock)), conf: nz >= 8 ? 'High' : nz >= 4 ? 'Medium' : 'Low', has: nz > 0 }
}

export function alerts(S) {
  const a = []
  S.products.filter(p => p.manage).forEach(p => {
    const lv = +p.reorder || 10
    if (p.qty <= 0) a.push({ k: 'bad', t: `${p.name} is out of stock` })
    else if (p.qty <= lv) a.push({ k: 'warn', t: `${p.name} is low: ${p.qty} left (reorder level ${lv})` })
  })
  const pend = S.docs.filter(d => d.type === 'invoice' && d.status === 'pending').length
  if (pend) a.push({ k: 'warn', t: `${pend} invoice${pend > 1 ? 's' : ''} waiting for approval` })
  const over = S.docs.filter(d => d.type === 'invoice' && d.status !== 'pending' && d.status !== 'rejected' && !d.paid && ago(d.date) > 7).length
  if (over) a.push({ k: 'warn', t: `${over} invoice${over > 1 ? 's are' : ' is'} overdue by more than 7 days` })
  S.products.filter(p => p.manage && +p.max_level > 0 && p.qty > +p.max_level).forEach(p => a.push({ k: 'warn', t: `${p.name} is overstocked: ${p.qty} against a maximum of ${p.max_level}` }))
  ;(S.lots || []).filter(l => l.expiry && l.remaining > 0 && (new Date(l.expiry) - Date.now()) / 864e5 <= 30).forEach(l => {
    const gone = new Date(l.expiry) < new Date(); a.push({ k: gone ? 'bad' : 'warn', t: `Lot ${l.lot_no} (${l.remaining} left) ${gone ? 'has expired' : 'expires on ' + l.expiry}` })
  })
  const po = (S.pos || []).filter(p => p.status === 'sent').length
  if (po) a.push({ k: 'warn', t: `${po} purchase order${po > 1 ? 's are' : ' is'} awaiting delivery` })
  return a
}

// Everything for the notification centre: stock, payments, approvals, expiry, follow-ups, credit limits, unusual spend and GST reminders.
export function notifications(S) {
  const n = alerts(S).map(a => ({ ...a, id: a.t })), now = new Date(), day = now.getDate(), td = now.toISOString().slice(0, 10), add = (k, t) => n.push({ k, t, id: t })
  S.leads.filter(l => !['Won', 'Lost'].includes(l.stage) && l.follow_up && l.follow_up <= td).forEach(l => add('warn', `Follow up with ${l.name}${l.company ? ' (' + l.company + ')' : ''}`))
  S.customers.filter(c => c.credit_limit > 0).forEach(c => { const out = S.docs.filter(d => d.type === 'invoice' && d.cust === c.id && d.status === 'approved').reduce((a, d) => a + (d.total || 0) - (d.paid_amt || 0), 0); if (out > c.credit_limit) add('bad', `${c.name} is over the credit limit`) })
  const u = unusualExpenses(S.expenses); if (u.size) add('warn', `${u.size} unusual expense${u.size > 1 ? 's' : ''} detected`)
  const po = S.pos.filter(p => p.status === 'awaiting_approval').length; if (po) add('warn', `${po} purchase order${po > 1 ? 's' : ''} need admin approval`)
  if (day >= 6 && day <= 11) add('warn', 'GSTR-1 is usually due around the 11th. Confirm your due date.')
  if (day >= 15 && day <= 20) add('warn', 'GSTR-3B is usually due around the 20th. Confirm your due date.')
  const open = (S.tasks || []).filter(t => t.status === 'open').length; if (open) add('warn', `${open} automation task${open > 1 ? 's are' : ' is'} open`)
  const bad = (S.runs || []).filter(r => r.status === 'failed' && Date.now() - new Date(String(r.at).replace(' ', 'T') + 'Z') < 864e5).length + (S.outbox || []).filter(o => o.status === 'failed').length
  if (bad) add('bad', `${bad} automation or email delivery failure${bad > 1 ? 's' : ''} in the last 24 hours`)
  return n
}

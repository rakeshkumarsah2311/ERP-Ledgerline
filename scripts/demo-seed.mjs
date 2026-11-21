// Loads a complete sample business ("Sharma Building Supplies") through the API, so every screen has data.
// Usage: start the server (npm run server), then:  npm run demo      (optional: BASE=http://localhost:3001)
import { closingChecks, healthScore, cashForecast, execSummary } from '../src/intel.js'

const BASE = (process.env.BASE || 'http://localhost:3001') + '/api', PASS = 'Demo@1234', now = new Date()
const iso = d => d.toISOString().slice(0, 10), T = iso(now), M1 = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))).slice(0, 7)
const ago = n => iso(new Date(now.getTime() - n * 864e5)), d1 = n => `${M1}-${String(n).padStart(2, '0')}`, plus = n => iso(new Date(now.getTime() + n * 864e5))
const tok = {}; let bad = 0
const call = async (t, method, path, body) => { const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) } }
const must = async (t, method, path, body) => { const r = await call(t, method, path, body); if (!r.ok) { console.error(`✗ ${method} ${path}: ${r.j.error}`); process.exit(1) } return r.j }
const check = (label, actual, expected) => { const ok = Math.abs(actual - expected) < 0.005; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${label}: ${actual}${ok ? '' : ' (expected ' + expected + ')'}`) }
const say = s => console.log('\n── ' + s)
const line = (code, name, price, qty, rate = 18, hsn = '') => ({ code, name, uom: 'Unit', price, qty, hsn, rate, lot: '' })
const bal = (S, a) => Math.round(S.ledger.filter(l => l.account === a).reduce((x, l) => x + l.debit - l.credit, 0) * 100) / 100

say('1. Create the business and the team')
const su = await call(null, 'POST', '/signup', { name: 'Rohan Sharma', business: 'Sharma Building Supplies', email: 'admin@ledgerline.test', phone: '9800000000', password: PASS })
if (!su.ok) { console.log('Demo data is already loaded (admin@ledgerline.test exists). Use a fresh database to load it again.'); process.exit(0) }
tok.admin = su.j.token
for (const [n, r] of [['Meera Das', 'manager'], ['Arjun Roy', 'accountant'], ['Sam Thapa', 'staff'], ['Chitra Sen', 'ceo']]) { await must(tok.admin, 'POST', '/team', { name: n, email: `${r}@ledgerline.test`, password: PASS, role: r }); tok[r] = (await must(null, 'POST', '/login', { email: `${r}@ledgerline.test`, password: PASS })).token }
console.log('✓ admin, manager, accountant, staff and ceo users created')

say('2. Company settings, warehouses, centres, suppliers, customers, products')
await must(tok.admin, 'PUT', '/company', { name: 'Sharma Building Supplies', address: '12 Hill Cart Road, Siliguri, West Bengal', phone: '9800000000', gst: '19ABCDE1234F1Z5', pan: 'ABCDE1234F', bank: 'State Bank of India\nA/C 00112233445\nIFSC SBIN0001234', logo: '', qr: '', seal: '', pincode: '734001', einvoice: true, currency: 'INR', fy_start: 4, po_limit: 50000, invoice_template: 'modern', revenue_target: 300000, credit_days: 30, pay_days: 30 })
const main = (await must(tok.admin, 'GET', '/all')).warehouses[0].id
await must(tok.admin, 'POST', '/warehouses', { id: 'wh2', name: 'Showroom - Siliguri', location: 'Sevoke Road' })
for (const [id, name, kind] of [['cp', 'Projects', 'profit'], ['cr', 'Retail counter', 'profit'], ['cs', 'Showroom operations', 'cost']]) await must(tok.admin, 'POST', '/centres', { id, name, kind })
for (const [id, name, gstin, phone] of [['s1', 'Ply Mart Pvt Ltd', '19AAACP1111A1Z5', '9822222222'], ['s2', 'Volt Cables', '19AAACV2222B1Z3', '9833333333']]) await must(tok.admin, 'POST', '/suppliers', { id, name, gstin, phone, address: 'Siliguri' })
for (const [id, name, gst, pin, limit, email] of [['c1', 'Cummins India', '19AAACC1206D1ZM', '734003', 100000, 'accounts@cummins.test'], ['c2', 'Tata Projects', '19AAACT2803M1Z4', '734004', 50000, 'ap@tataprojects.test'], ['c3', 'Walk-in customer', '', '', 0, '']])
  await must(tok.admin, 'POST', '/customers', { id, name, attn: '', phone: '98110000' + id.slice(1), a1: 'Siliguri', a2: 'Siliguri', gst, pan: '', logo: '', pincode: pin, credit_limit: limit, email })
const P = [['p1', 'P1001', 'Green Ply 18mm', 1200, 800, '4412', 18, 20, 150, 'Carpentry', 'Plywood'], ['p2', 'P1002', 'Copper Wire 1.5mm (90m)', 2400, 1700, '8544', 18, 25, 0, 'Electrical', 'Wires'], ['p3', 'P1003', 'Chrome Faucet', 650, 400, '8481', 18, 15, 0, 'Plumbing', 'Faucets'],
  ['p4', 'P1004', 'Wall Primer 20L', 3100, 2200, '3208', 18, 40, 0, 'Paints', 'Wall primer'], ['p5', 'P1005', 'PVC Pipe 1 inch', 180, 120, '3917', 12, 30, 150, 'Plumbing', 'Pipes']]
for (const [id, code, name, price, cost, hsn, rate, reorder, max, cat, sub] of P) await must(tok.admin, 'POST', '/products', { id, code, name, description: name, price, uom: 'Unit', cat, sub, img: '', manage: true, qty: 0, barcode: '89010' + code.slice(1), hsn, gst_rate: rate, reorder, cost, max_level: max })
for (const [code, rent] of [[M1, 12000], [T.slice(0, 7), 12000]]) for (const [acct, amt] of [['6000', rent], ['6020', 4000], ['6030', 6000]]) await must(tok.admin, 'POST', '/budgets', { id: `b${code}${acct}`, period: code, account: acct, centre: '', amount: amt })
console.log('✓ 2 warehouses, 3 centres, 2 suppliers, 3 customers, 5 products, budgets')

say('3. Opening position (owner capital and opening stock with an expiry date)')
await must(tok.accountant, 'POST', '/journal', { date: d1(1), ref: 'Opening', memo: 'Owner capital introduced', lines: [{ account: '1010', debit: 1000000 }, { account: '3000', credit: 1000000 }] })
await must(tok.manager, 'POST', '/lots', { id: 'lot0', lot_no: 'PR-0126', product_id: 'p4', qty: 40, received: d1(10), note: 'Opening stock', warehouse_id: main, expiry: plus(20) })
await must(tok.accountant, 'POST', '/journal', { date: d1(10), ref: 'Opening stock', memo: 'Opening stock of Wall Primer at cost', lines: [{ account: '1200', debit: 88000 }, { account: '3000', credit: 88000 }] })

say('4. Purchasing: approval limit, goods receipt, supplier payments')
const po = (id, no, date, supplier, items) => must(tok.manager, 'POST', '/pos', { id, no, date, supplier, warehouse: main, note: '', items })
const it = (code, name, qty, price, rate, hsn) => ({ code, name, uom: 'Unit', qty, price, rate, hsn })
await po('o1', 'PO-1001', ago(45), 's1', [it('P1001', 'Green Ply 18mm', 100, 800, 18, '4412'), it('P1003', 'Chrome Faucet', 40, 400, 18, '8481')])
console.log('  PO-1001 status after manager sends:', (await must(tok.manager, 'POST', '/pos/o1/send')).status, '(above the ₹50,000 limit, so it waits for the admin)')
await must(tok.admin, 'POST', '/pos/o1/approve'); await must(tok.manager, 'POST', '/pos/o1/send'); await must(tok.manager, 'POST', '/pos/o1/receive')
await po('o2', 'PO-1002', d1(8), 's2', [it('P1002', 'Copper Wire 1.5mm (90m)', 30, 1700, 18, '8544')]); await must(tok.admin, 'POST', '/pos/o2/send'); await must(tok.manager, 'POST', '/pos/o2/receive')
await po('o3', 'PO-1003', d1(10), 's1', [it('P1005', 'PVC Pipe 1 inch', 200, 120, 12, '3917')]); await must(tok.manager, 'POST', '/pos/o3/send'); await must(tok.manager, 'POST', '/pos/o3/receive')
await must(tok.accountant, 'POST', '/payments', { kind: 'payment', doc_id: 'o1', amount: 60000, mode: 'bank', date: d1(12), ref: 'NEFT 4411' })
await must(tok.accountant, 'POST', '/payments', { kind: 'payment', doc_id: 'o2', amount: 60180, mode: 'bank', date: d1(20), ref: 'NEFT 4420' })
await must(tok.accountant, 'POST', '/payments', { kind: 'payment', doc_id: 'o3', amount: 26880, mode: 'bank', date: d1(22), ref: 'NEFT 4433' })
let S = await must(tok.admin, 'GET', '/all')
check('PO-1001 total', S.pos.find(p => p.id === 'o1').total, 113280); check('PO-1002 total', S.pos.find(p => p.id === 'o2').total, 60180); check('PO-1003 total', S.pos.find(p => p.id === 'o3').total, 26880)

say('5. Sales: approvals, credit limit, payments')
const inv = (id, no, date, cust, centre, items, discount = 0) => ({ id, type: 'invoice', no, date, cust, driver: '', warehouse: main, centre, discount, paid: false, doc: '', items })
await must(tok.admin, 'POST', '/docs', inv('i1', '1234', d1(12), 'c1', 'cp', [line('P1001', 'Green Ply 18mm', 1200, 10, 18, '4412'), line('P1002', 'Copper Wire 1.5mm (90m)', 2400, 2, 18, '8544')], 500))
await must(tok.staff, 'POST', '/docs', inv('i2', '1235', ago(45), 'c2', 'cp', [line('P1001', 'Green Ply 18mm', 1200, 20, 18, '4412'), line('P1003', 'Chrome Faucet', 650, 10, 18, '8481')]))
console.log('  Staff invoice 1235 is waiting for approval; stock and books unchanged until the manager approves')
await must(tok.manager, 'POST', '/docs/i2/approve')
await must(tok.admin, 'POST', '/docs', inv('i3', '1236', d1(20), 'c3', 'cr', [line('P1005', 'PVC Pipe 1 inch', 180, 10, 12, '3917'), line('P1003', 'Chrome Faucet', 650, 2, 18, '8481')]))
await must(tok.accountant, 'POST', '/payments', { kind: 'receipt', doc_id: 'i3', amount: 3550, mode: 'cash', date: d1(20), ref: 'Counter sale' })
await must(tok.accountant, 'POST', '/payments', { kind: 'receipt', doc_id: 'i1', amount: 10000, mode: 'bank', date: d1(25), ref: 'UTR 1001' })
await must(tok.admin, 'POST', '/docs', inv('i4', '1237', T, 'c1', 'cp', [line('P1004', 'Wall Primer 20L', 3100, 5, 18, '3208'), line('P1002', 'Copper Wire 1.5mm (90m)', 2400, 3, 18, '8544')]))
const blocked = await call(tok.manager, 'POST', '/docs', inv('i5', '1238', T, 'c2', 'cp', [line('P1001', 'Green Ply 18mm', 1200, 15, 18, '4412'), line('P1002', 'Copper Wire 1.5mm (90m)', 2400, 5, 18, '8544')]))
console.log('  Manager creating 1238 for Tata Projects →', blocked.status, blocked.j.error)
await must(tok.admin, 'POST', '/docs', inv('i5', '1238', T, 'c2', 'cp', [line('P1001', 'Green Ply 18mm', 1200, 15, 18, '4412'), line('P1002', 'Copper Wire 1.5mm (90m)', 2400, 5, 18, '8544')]))
await must(tok.admin, 'POST', '/docs', inv('i6', '1239', T, 'c1', 'cp', [line('P1001', 'Green Ply 18mm', 1200, 20, 18, '4412'), line('P1003', 'Chrome Faucet', 650, 15, 18, '8481')]))
await must(tok.accountant, 'POST', '/payments', { kind: 'receipt', doc_id: 'i1', amount: 5000, mode: 'bank', date: T, ref: 'UTR 2002' })
const cn = await must(tok.accountant, 'POST', '/returns', { invoice_id: 'i1', date: T, reason: 'Damaged in transit', restock: true, lines: [{ code: 'P1001', qty: 2 }] })
console.log('  Credit note', cn.no, 'issued for', cn.total)
S = await must(tok.admin, 'GET', '/all'); const tot = no => S.docs.find(d => d.no === no).total
for (const [no, v] of [['1234', 19234], ['1235', 35990], ['1236', 3550], ['1237', 26786], ['1238', 35400], ['1239', 39825]]) check(`Invoice ${no} total`, tot(no), v)

say('6. Expenses, recurring entry, fixed asset, depreciation')
for (const [date, account, payee, amount, gst, mode, centre] of [[d1(2), '6000', 'Landlord', 12000, 0, 'bank', 'cs'], [T, '6000', 'Landlord', 12000, 0, 'bank', 'cs'], [d1(18), '6020', 'Power company', 3200, 576, 'bank', 'cs'], [T, '6020', 'Power company', 4500, 810, 'bank', 'cs'], [T, '6030', 'Transporter', 2200, 0, 'cash', '']])
  await must(tok.accountant, 'POST', '/expenses', { date, account, payee, amount, gst, mode, note: '', centre })
await must(tok.accountant, 'POST', '/recurring', { memo: 'Insurance premium', next_date: T, lines: [{ account: '6040', debit: 1500 }, { account: '1010', credit: 1500 }] })
console.log('  Recurring entries posted now:', (await must(tok.accountant, 'POST', '/recurring/run')).posted)
await must(tok.accountant, 'POST', '/assets', { name: 'Delivery tempo', category: 'Vehicle', purchase_date: d1(3), cost: 240000, salvage: 40000, life_years: 8, paid_from: 'bank' })
for (const p of [M1, T.slice(0, 7)]) console.log('  Depreciation', p, '→', (await must(tok.accountant, 'POST', '/assets/depreciate', { period: p })).amount)

say('7. Warehouse: transfer and physical count')
await must(tok.manager, 'POST', '/transfer', { product_id: 'p1', from: main, to: 'wh2', qty: 20, note: 'Stock for the showroom' })
console.log('  Count result:', JSON.stringify(await must(tok.manager, 'POST', '/stock/adjust', { warehouse_id: 'wh2', reason: 'Monthly count', lines: [{ product_id: 'p1', counted: 19 }] })))

say('8. CRM and GST compliance (sandbox)')
for (const [id, name, company, value] of [['ld1', 'Anil Gupta', 'Gupta Constructions', 250000], ['ld2', 'Bina Roy', 'Roy Interiors', 90000], ['ld3', 'Kiran Lama', 'Lama Hotels', 400000]])
  await must(tok.manager, 'POST', '/leads', { id, name, company, phone: '9844000000', email: '', value, stage: 'New', follow_up: T, note: 'Enquired about bulk order', owner: '' })
console.log('  E-invoice 1234:', (await must(tok.admin, 'POST', '/docs/i1/einvoice')).ok ? 'IRN generated (sandbox)' : '')
console.log('  E-way bill 1235:', (await must(tok.admin, 'POST', '/docs/i2/eway', { vehicle: 'WB74AB1234', distance: 120 })).ok ? 'generated (sandbox)' : '')

say('9. Automation')
console.log('  New tasks:', (await must(tok.manager, 'POST', '/automation/run')).created)

say('10. Result: books, stock and checks')
S = await must(tok.admin, 'GET', '/all')
const names = Object.fromEntries(S.accounts.map(a => [a.code, a.name]))
console.log('Ledger balances (debit positive, credit negative):'); for (const c of ['1000', '1010', '1100', '1200', '1300', '1500', '1510', '2000', '2100', '3000', '4000', '5000', '5100', '6000', '6010', '6020', '6030', '6040', '6050']) if (bal(S, c)) console.log(`  ${c} ${names[c].padEnd(24)} ${bal(S, c).toFixed(2).padStart(12)}`)
check('Books balance (sum of all debits minus credits)', S.ledger.reduce((a, l) => a + l.debit - l.credit, 0), 0)
check('Receivables = invoices − receipts − credit note', bal(S, '1100'), Math.round((19234 + 35990 + 3550 + 26786 + 35400 + 39825 - 10000 - 5000 - 3550 - cn.total) * 100) / 100)
check('Payables (PO-1001 balance)', -bal(S, '2000'), 53280)
console.log('Stock:', S.products.map(p => `${p.code}=${p.qty}`).join('  '))
const cc = closingChecks(S, M1); console.log(`Closing checks for ${M1} (can close: ${cc.canClose}):`); cc.checks.forEach(c => console.log(`  [${c.k}] ${c.label} (${c.detail})`))
const hs = healthScore(S, T); console.log(`Health score: ${hs.score} (${hs.grade})`); hs.parts.forEach(p => console.log(`  ${p.label}: ${p.score} ${p.note}`))
console.log('30/60/90-day cash forecast:', cashForecast(S, T).rows.map(r => `${r.days}d ₹${r.projected}`).join('  '))
console.log('Executive summary:'); execSummary(S, T, n => '₹' + n).forEach(s => console.log('  -', s.t))
console.log(`\nSign in at http://localhost:5173 (or :3001) as admin@ledgerline.test, manager@, accountant@, staff@ or ceo@ledgerline.test — password ${PASS}`)
process.exit(bad ? 1 : 0)

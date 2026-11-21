// End-to-end tests against the real server and a throwaway database. Run with: npm test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 3950 + Math.floor(Math.random() * 40), DB = `/tmp/ledgerline-it-${process.pid}.db`, base = `http://localhost:${PORT}/api`
let srv; const tok = {}, today = new Date().toISOString().slice(0, 10)
const call = async (t, method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) } }
const all = async t => (await call(t, 'GET', '/all')).j
const bal = (S, a) => S.ledger.filter(l => l.account === a).reduce((x, l) => x + l.debit - l.credit, 0)
const r2 = n => Math.round(n * 100) / 100
const prevMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) }

before(async () => {
  for (const f of [DB, DB + '-wal', DB + '-shm']) fs.rmSync(f, { force: true })
  srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, LEDGERLINE_DB: DB, JWT_SECRET: 'test-secret' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let err = ''; srv.stderr.on('data', d => { if (!String(d).includes('Experimental')) err += d })
  await new Promise((ok, no) => { srv.stdout.on('data', d => String(d).includes('running') && ok()); srv.on('exit', c => no(new Error('server exited: ' + err))); setTimeout(() => no(new Error('server did not start: ' + err)), 8000) })
})
after(() => { srv && srv.kill(); for (const f of [DB, DB + '-wal', DB + '-shm']) fs.rmSync(f, { force: true }) })

test('sign up, log in, reject bad credentials', async () => {
  const s = await call(null, 'POST', '/signup', { name: 'Owner', business: 'Acme Traders', email: 'owner@acme.test', phone: '9800000000', password: 'secret1' })
  assert.equal(s.status, 200); assert.equal(s.j.user.role, 'admin'); tok.admin = s.j.token
  assert.equal((await call(null, 'POST', '/signup', { name: 'X', business: 'Y', email: 'owner@acme.test', password: 'secret1' })).status, 400)
  assert.equal((await call(null, 'POST', '/login', { email: 'owner@acme.test', password: 'wrong' })).status, 400)
  assert.equal((await call(null, 'POST', '/login', { email: 'owner@acme.test', password: 'secret1' })).status, 200)
  assert.equal((await call(null, 'GET', '/all')).status, 401)
})
test('a new business gets accounts, a warehouse and automation rules', async () => {
  const S = await all(tok.admin); assert.ok(S.accounts.length >= 20 && S.accounts.some(a => a.code === '1500')); assert.equal(S.warehouses.length, 1); assert.equal(S.rules.length, 9)
  const c = await call(tok.admin, 'PUT', '/company', { name: 'Acme Traders', address: '12 Hill Cart Road, Siliguri', phone: '9800000000', gst: '19ABCDE1234F1Z5', pan: 'ABCDE1234F', bank: '', logo: '', qr: '', seal: '', pincode: '734001', einvoice: false, currency: 'INR', fy_start: 4, po_limit: 0, invoice_template: 'classic', revenue_target: 100000, credit_days: 30, pay_days: 30 })
  assert.equal(c.status, 200)
})
test('team roles: accountant, staff and ceo can be created and sign in', async () => {
  for (const [n, r] of [['Acc', 'accountant'], ['Sam', 'staff'], ['Cee', 'ceo'], ['Mia', 'manager']]) {
    assert.equal((await call(tok.admin, 'POST', '/team', { name: n, email: `${r}@acme.test`, password: 'secret1', role: r })).status, 200)
    const l = await call(null, 'POST', '/login', { email: `${r}@acme.test`, password: 'secret1' }); assert.equal(l.status, 200); assert.equal(l.j.user.role, r); tok[r] = l.j.token
  }
  assert.equal((await call(tok.staff, 'PUT', '/company', { name: 'Hack' })).status, 403)
  assert.equal((await call(tok.ceo, 'POST', '/customers', { id: 'zz', name: 'No' })).status, 403)
})
let wh
test('master data and a stock lot', async () => {
  wh = (await all(tok.admin)).warehouses[0].id
  assert.equal((await call(tok.admin, 'POST', '/customers', { id: 'c1', name: 'Cummins', attn: '', phone: '9811111111', a1: 'Plot 4', a2: 'Siliguri', gst: '19AAACC1206D1ZM', pan: '', logo: '', pincode: '734003', credit_limit: 0, email: 'buy@cummins.test' })).status, 200)
  assert.equal((await call(tok.admin, 'POST', '/products', { id: 'p1', code: 'P1', name: 'Plywood', description: 'Green ply', price: 1000, uom: 'Unit', cat: 'Carpentry', sub: 'Plywood', img: '', manage: true, qty: 0, barcode: '8901', hsn: '4412', gst_rate: 18, reorder: 10, cost: 600, max_level: 0 })).status, 200)
  assert.equal((await call(tok.admin, 'POST', '/lots', { id: 'l1', lot_no: 'L-1', product_id: 'p1', qty: 50, received: today, note: '', warehouse_id: wh, expiry: '' })).status, 200)
  const S = await all(tok.admin); assert.equal(S.products[0].qty, 50); assert.equal(S.stock.find(s => s.product_id === 'p1').qty, 50); assert.equal(S.lots[0].remaining, 50)
})
const inv = (id, no, qty, extra = {}) => ({ id, type: 'invoice', no, date: today, cust: 'c1', driver: '', warehouse: wh, centre: '', discount: 0, paid: false, doc: '', items: [{ code: 'P1', name: 'Plywood', uom: 'Unit', price: 1000, qty, hsn: '4412', rate: 18, lot: '' }], ...extra })
test('an approved invoice deducts stock by lot and posts balanced books exactly once', async () => {
  assert.equal((await call(tok.admin, 'POST', '/docs', inv('i1', '1234', 2))).status, 200)
  let S = await all(tok.admin), d = S.docs.find(x => x.id === 'i1'); assert.equal(d.status, 'approved'); assert.equal(d.total, 2360); assert.equal(d.items[0].lot, 'L-1×2')
  assert.equal(S.products[0].qty, 48); assert.equal(S.lots[0].remaining, 48); assert.equal(S.lot_sales.length, 1)
  assert.equal(bal(S, '1100'), 2360); assert.equal(bal(S, '4000'), -2000); assert.equal(bal(S, '2100'), -360); assert.equal(bal(S, '5000'), 1200); assert.equal(bal(S, '1200'), -1200)
  assert.equal(r2(S.ledger.reduce((a, l) => a + l.debit - l.credit, 0)), 0)
  assert.equal((await call(tok.admin, 'PUT', '/docs/i1', { ...d })).status, 200)
  S = await all(tok.admin); assert.equal(S.ledger.filter(l => l.ref === 'INV 1234').length, 5, 'no duplicate posting'); assert.equal(S.products[0].qty, 48, 'no double stock deduction')
})
test('payments: partial, over-payment rejected, full settlement marks paid', async () => {
  assert.equal((await call(tok.admin, 'POST', '/payments', { kind: 'receipt', doc_id: 'i1', amount: 1000, mode: 'bank', date: today })).status, 200)
  assert.equal((await call(tok.admin, 'POST', '/payments', { kind: 'receipt', doc_id: 'i1', amount: 5000, mode: 'bank' })).status, 400)
  let S = await all(tok.admin); assert.equal(S.docs[0].paid_amt, 1000); assert.equal(S.docs[0].paid, false); assert.equal(bal(S, '1010'), 1000)
  assert.equal((await call(tok.accountant, 'POST', '/payments', { kind: 'receipt', doc_id: 'i1', amount: 1360, mode: 'cash' })).status, 200)
  S = await all(tok.admin); assert.equal(S.docs[0].paid, true); assert.equal(bal(S, '1100'), 0)
})
test('staff invoices wait for approval; nothing posts until a manager approves', async () => {
  assert.equal((await call(tok.staff, 'POST', '/docs', inv('i2', '1235', 1))).status, 200)
  let S = await all(tok.admin); assert.equal(S.docs.find(x => x.id === 'i2').status, 'pending'); assert.equal(S.products[0].qty, 48); assert.equal(S.ledger.filter(l => l.ref === 'INV 1235').length, 0)
  assert.equal((await call(tok.staff, 'POST', '/docs/i2/approve')).status, 403)
  assert.equal((await call(tok.manager, 'POST', '/docs/i2/approve')).status, 200)
  S = await all(tok.admin); assert.equal(S.products[0].qty, 47); assert.equal(S.ledger.filter(l => l.ref === 'INV 1235').length, 5)
  assert.equal((await call(tok.manager, 'POST', '/docs/i2/approve')).status, 400, 'cannot approve twice')
})
test('credit limit blocks non-admins but not admins; the rule can be switched off', async () => {
  await call(tok.admin, 'PUT', '/customers/c1', { id: 'c1', name: 'Cummins', attn: '', phone: '', a1: '', a2: '', gst: '19AAACC1206D1ZM', pan: '', logo: '', pincode: '734003', credit_limit: 1000, email: '' })
  const r = await call(tok.manager, 'POST', '/docs', inv('i3', '1236', 3)); assert.equal(r.status, 400); assert.match(r.j.error, /Credit limit exceeded/)
  assert.equal((await call(tok.admin, 'POST', '/docs', inv('i3', '1236', 3))).status, 200)
  const S = await all(tok.admin), rule = S.rules.find(x => x.kind === 'credit_block')
  assert.equal((await call(tok.admin, 'PUT', '/automation/rules/' + rule.id, { enabled: false, channel: 'inapp', param: 0 })).status, 200)
  assert.equal((await call(tok.manager, 'POST', '/docs', inv('i4', '1237', 1))).status, 200)
})
test('purchase order: approval limit, goods receipt creates a lot and the payable, supplier payment clears it', async () => {
  assert.equal((await call(tok.admin, 'POST', '/suppliers', { id: 's1', name: 'Ply Co', gstin: '19AAACP1111A1Z5', phone: '9822222222', address: 'Siliguri' })).status, 200)
  const po = { id: 'o1', no: 'PO-1001', date: today, supplier: 's1', warehouse: wh, note: '', items: [{ code: 'P1', name: 'Plywood', uom: 'Unit', qty: 10, price: 600, rate: 18, hsn: '4412' }] }
  assert.equal((await call(tok.manager, 'POST', '/pos', po)).status, 200)
  await call(tok.admin, 'PUT', '/company', { name: 'Acme Traders', address: 'x', phone: '', gst: '19ABCDE1234F1Z5', pan: '', bank: '', logo: '', qr: '', seal: '', pincode: '734001', einvoice: false, currency: 'INR', fy_start: 4, po_limit: 1000, invoice_template: 'classic', revenue_target: 0, credit_days: 30, pay_days: 30 })
  assert.equal((await call(tok.manager, 'POST', '/pos/o1/send')).j.status, 'awaiting_approval')
  assert.equal((await call(tok.manager, 'POST', '/pos/o1/receive')).status, 400, 'cannot receive before approval')
  assert.equal((await call(tok.manager, 'POST', '/pos/o1/approve')).status, 403); assert.equal((await call(tok.admin, 'POST', '/pos/o1/approve')).status, 200)
  assert.equal((await call(tok.manager, 'POST', '/pos/o1/send')).j.status, 'sent')
  const before = (await all(tok.admin)).products[0].qty
  const r = await call(tok.manager, 'POST', '/pos/o1/receive'); assert.equal(r.j.created, 1)
  let S = await all(tok.admin); assert.equal(S.products[0].qty, before + 10); assert.equal(S.lots.length, 2); assert.equal(bal(S, '2000'), -7080); assert.equal(bal(S, '1300') > 0, true)
  assert.equal((await call(tok.manager, 'POST', '/pos/o1/receive')).status, 400, 'no double receipt')
  assert.equal((await call(tok.accountant, 'POST', '/payments', { kind: 'payment', doc_id: 'o1', amount: 7080, mode: 'bank' })).status, 200)
  S = await all(tok.admin); assert.equal(bal(S, '2000'), 0)
})
test('expenses, manual journals and their validation', async () => {
  assert.equal((await call(tok.accountant, 'POST', '/expenses', { date: today, account: '6040', payee: 'Stationers', amount: 500, gst: 90, mode: 'cash' })).status, 200)
  assert.equal((await call(tok.accountant, 'POST', '/expenses', { date: today, account: '4000', amount: 5, mode: 'cash' })).status, 400, 'income account is not an expense head')
  assert.equal((await call(tok.accountant, 'POST', '/journal', { date: today, lines: [{ account: '1000', debit: 100 }, { account: '3000', credit: 99 }] })).status, 400)
  assert.equal((await call(tok.accountant, 'POST', '/journal', { date: today, memo: 'Opening', lines: [{ account: '1000', debit: 100000 }, { account: '3000', credit: 100000 }] })).status, 200)
  assert.equal((await call(tok.staff, 'POST', '/journal', { date: today, lines: [{ account: '1000', debit: 1 }, { account: '3000', credit: 1 }] })).status, 403)
  const S = await all(tok.admin); assert.equal(r2(S.ledger.reduce((a, l) => a + l.debit - l.credit, 0)), 0, 'books balance')
})
test('period closing blocks postings; only an admin can reopen, with a reason', async () => {
  const p = prevMonth(), d = p + '-15'
  assert.equal((await call(tok.accountant, 'POST', '/journal', { date: d, lines: [{ account: '1000', debit: 10 }, { account: '3000', credit: 10 }] })).status, 200)
  assert.equal((await call(tok.accountant, 'POST', '/periods/close', { period: today.slice(0, 7) })).status, 400, 'current month cannot be closed')
  assert.equal((await call(tok.accountant, 'POST', '/periods/close', { period: p })).status, 200)
  const r = await call(tok.accountant, 'POST', '/journal', { date: d, lines: [{ account: '1000', debit: 10 }, { account: '3000', credit: 10 }] }); assert.equal(r.status, 400); assert.match(r.j.error, /is closed/)
  assert.equal((await call(tok.accountant, 'POST', '/periods/reopen', { period: p, reason: 'fix entry' })).status, 403)
  assert.equal((await call(tok.admin, 'POST', '/periods/reopen', { period: p, reason: 'x' })).status, 400)
  assert.equal((await call(tok.admin, 'POST', '/periods/reopen', { period: p, reason: 'Correcting a posting' })).status, 200)
  assert.equal((await call(tok.accountant, 'POST', '/journal', { date: d, lines: [{ account: '1000', debit: 10 }, { account: '3000', credit: 10 }] })).status, 200)
})
test('fixed assets depreciate once per month and keep the books balanced', async () => {
  assert.equal((await call(tok.accountant, 'POST', '/assets', { name: 'Forklift', category: 'Equipment', purchase_date: today, cost: 120000, salvage: 12000, life_years: 3, paid_from: 'bank' })).status, 200)
  assert.equal((await call(tok.accountant, 'POST', '/assets', { name: 'Bad', purchase_date: today, cost: 100, salvage: 200, life_years: 3 })).status, 400)
  const a = await call(tok.accountant, 'POST', '/assets/depreciate', { period: today.slice(0, 7) }); assert.equal(a.j.amount, 3000)
  assert.equal((await call(tok.accountant, 'POST', '/assets/depreciate', { period: today.slice(0, 7) })).j.amount, 0, 'second run posts nothing')
  const S = await all(tok.admin); assert.equal(bal(S, '1500'), 120000); assert.equal(bal(S, '1510'), -3000); assert.equal(bal(S, '6050'), 3000); assert.equal(S.assets[0].acc_dep, 3000)
})
test('recurring journals post once per due date', async () => {
  const lines = [{ account: '6000', debit: 5000 }, { account: '1010', credit: 5000 }]
  assert.equal((await call(tok.accountant, 'POST', '/recurring', { memo: 'Rent', next_date: today, lines })).status, 200)
  assert.equal((await call(tok.accountant, 'POST', '/recurring', { memo: 'Bad', next_date: today, lines: [{ account: '6000', debit: 5 }, { account: '1010', credit: 4 }] })).status, 400)
  assert.equal((await call(tok.accountant, 'POST', '/recurring/run')).j.posted, 1); assert.equal((await call(tok.accountant, 'POST', '/recurring/run')).j.posted, 0)
  assert.equal(bal(await all(tok.admin), '6000'), 5000)
})
test('stock count posts variances to stock and the books', async () => {
  const S0 = await all(tok.admin), sys = S0.stock.find(s => s.product_id === 'p1' && s.warehouse_id === wh).qty
  const r = await call(tok.manager, 'POST', '/stock/adjust', { warehouse_id: wh, reason: 'Count', lines: [{ product_id: 'p1', counted: sys - 2 }] }); assert.equal(r.j.adjusted, 1)
  const S = await all(tok.admin); assert.equal(S.stock.find(s => s.product_id === 'p1' && s.warehouse_id === wh).qty, sys - 2); assert.equal(bal(S, '5100'), 1200); assert.ok(S.movements.some(m => m.kind === 'count'))
})
test('automation creates de-duplicated tasks, assigns leads and logs the run', async () => {
  await call(tok.admin, 'POST', '/products', { id: 'p2', code: 'P2', name: 'Wire', description: '', price: 100, uom: 'Unit', cat: 'Electrical', sub: 'Wires', img: '', manage: true, qty: 3, barcode: '', hsn: '', gst_rate: 18, reorder: 10, cost: 50, max_level: 0 })
  await call(tok.manager, 'POST', '/leads', { id: 'ld1', name: 'New Lead', company: 'Foo', phone: '', email: '', value: 5000, stage: 'New', follow_up: today, note: '', owner: '' })
  assert.equal((await call(tok.manager, 'POST', '/automation/run')).status, 200)
  let S = await all(tok.admin); const n = S.tasks.length; assert.ok(S.tasks.some(t => t.kind === 'low_stock' && t.title.includes('Wire'))); assert.equal(S.leads[0].owner, 'Sam'); assert.ok(S.runs.length > 0)
  await call(tok.manager, 'POST', '/automation/run'); S = await all(tok.admin); assert.equal(S.tasks.length, n, 'no duplicate tasks on the second run')
  assert.equal((await call(tok.staff, 'POST', '/tasks/' + S.tasks[0].id + '/done')).status, 200)
})
test('sales returns: credit note reverses sales and GST, restocks, limits quantity, and respects roles', async () => {
  let S = await all(tok.admin); const stock0 = S.products.find(p => p.id === 'p1').qty, ar0 = bal(S, '1100'), sales0 = bal(S, '4000')
  assert.equal((await call(tok.staff, 'POST', '/returns', { invoice_id: 'i1', lines: [{ code: 'P1', qty: 1 }] })).status, 403)
  const r = await call(tok.accountant, 'POST', '/returns', { invoice_id: 'i1', reason: 'Damaged', restock: true, lines: [{ code: 'P1', qty: 1 }] }); assert.equal(r.status, 200); assert.equal(r.j.total, 1180)
  S = await all(tok.admin); assert.equal(r2(bal(S, '1100') - ar0), -1180); assert.equal(r2(bal(S, '4000') - sales0), 1000)
  assert.equal(S.products.find(p => p.id === 'p1').qty, stock0 + 1); assert.ok(S.lots.some(l => l.lot_no.startsWith('RET-'))); assert.equal(S.credit_notes[0].items[0].taxable, 1000)
  assert.equal(r2(S.ledger.reduce((a, l) => a + l.debit - l.credit, 0)), 0)
  const again = await call(tok.accountant, 'POST', '/returns', { invoice_id: 'i1', lines: [{ code: 'P1', qty: 2 }] }); assert.equal(again.status, 400); assert.match(again.j.error, /Only 1 of Plywood/)
  assert.equal((await call(tok.accountant, 'POST', '/returns', { invoice_id: 'i1', lines: [{ code: 'P1', qty: 1 }] })).status, 200)
  assert.equal((await call(tok.accountant, 'POST', '/returns', { invoice_id: 'i1', lines: [{ code: 'P1', qty: 1 }] })).status, 400, 'nothing left to return')
  assert.equal((await call(tok.accountant, 'POST', '/returns', { invoice_id: 'nope', lines: [{ code: 'P1', qty: 1 }] })).status, 400)
})
test('audit log records changes and sign-ins', async () => {
  const a = await call(tok.admin, 'GET', '/audit'); assert.equal(a.status, 200); assert.ok(a.j.some(x => x.action === 'login')); assert.ok(a.j.some(x => x.entity === 'docs'))
  assert.equal((await call(tok.staff, 'GET', '/audit')).status, 403)
})
test('backup and restore round-trip the whole business', async () => {
  const b = await call(tok.admin, 'GET', '/backup'); assert.equal(b.status, 200); const S0 = await all(tok.admin)
  await call(tok.admin, 'DELETE', '/customers/c1')
  assert.equal((await call(tok.admin, 'POST', '/restore', b.j)).status, 200)
  const S1 = await all(tok.admin)
  for (const k of ['customers', 'products', 'docs', 'pos', 'lots', 'ledger', 'payments', 'assets', 'accounts', 'credit_notes']) assert.equal(S1[k].length, S0[k].length, k)
  assert.equal(r2(S1.ledger.reduce((a, l) => a + l.debit - l.credit, 0)), 0); assert.equal(S1.products.find(p => p.id === 'p1').qty, S0.products.find(p => p.id === 'p1').qty)
  assert.equal((await call(tok.manager, 'POST', '/restore', b.j)).status, 403)
})
test('tenants are isolated', async () => {
  const o = await call(null, 'POST', '/signup', { name: 'Other', business: 'Other Co', email: 'o@other.test', password: 'secret1' }); const S = await all(o.j.token)
  assert.equal(S.customers.length, 0); assert.equal(S.docs.length, 0); assert.equal(S.ledger.length, 0)
  assert.equal((await call(o.j.token, 'POST', '/payments', { kind: 'receipt', doc_id: 'i1', amount: 1 })).status, 400)
})

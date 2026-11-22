import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { buildEinvoice, buildEway, irnOf, gsp } from './gst.js'
import { CHART, totals, assertBalanced, invoiceEntry, poEntry, receiptEntry, supplierPayEntry } from './accounting.js'
import { mount } from './erp.js'
import { mountFinance } from './finance.js'
import { mountAutomation, ensureRules } from './automation.js'
import { mountReturns } from './returns.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production')
const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production'
const db = new Database(process.env.LEDGERLINE_DB || path.join(dir, 'ledgerline.db'))
db.pragma('journal_mode = WAL')

// Every row belongs to a business (user_id = the owner's id). Team members share their owner's data.
const T = {
  customers: ['name', 'attn', 'phone', 'a1', 'a2', 'gst', 'pan', 'logo', 'pincode', 'credit_limit', 'email'],
  drivers: ['name', 'phone', 'res', 'proof'],
  products: ['code', 'name', 'description', 'price', 'uom', 'cat', 'sub', 'img', 'manage', 'qty', 'barcode', 'hsn', 'gst_rate', 'reorder', 'cost', 'max_level'],
  lots: ['lot_no', 'product_id', 'qty', 'received', 'note', 'warehouse_id', 'expiry'],
  warehouses: ['name', 'location'],
  suppliers: ['name', 'gstin', 'phone', 'address'],
  leads: ['name', 'company', 'phone', 'email', 'value', 'stage', 'follow_up', 'note', 'owner'],
  accounts: ['code', 'name', 'type'],
  centres: ['name', 'kind'],
  budgets: ['period', 'account', 'centre', 'amount'],
}
const COMPANY = ['name', 'address', 'phone', 'gst', 'pan', 'bank', 'logo', 'qr', 'seal', 'pincode', 'einvoice', 'currency', 'fy_start', 'po_limit', 'invoice_template', 'revenue_target', 'credit_days', 'pay_days']
const NUM = new Set(['price', 'qty', 'gst_rate', 'reorder', 'cost', 'max_level', 'credit_limit', 'value', 'po_limit', 'fy_start', 'amount', 'revenue_target', 'credit_days', 'pay_days'])
const W = ['admin', 'manager']
const WRW = { customers: [...W, 'staff'], leads: [...W, 'staff'], accounts: [...W, 'accountant'], budgets: [...W, 'accountant'], centres: [...W, 'accountant'] }

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, business TEXT, email TEXT UNIQUE, phone TEXT, hash TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP, owner_id INTEGER, role TEXT);
CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY,user_id INTEGER,expires INTEGER);
CREATE TABLE IF NOT EXISTS company(user_id INTEGER PRIMARY KEY, ${COMPANY.join(',')});
${Object.entries(T).map(([t, c]) => `CREATE TABLE IF NOT EXISTS ${t}(id TEXT PRIMARY KEY, user_id INTEGER, ${c.join(',')});`).join('\n')}
CREATE TABLE IF NOT EXISTS docs(id TEXT PRIMARY KEY, user_id INTEGER, type, no, date, cust, driver, discount, paid, doc, warehouse, status, stocked, created_by);
CREATE TABLE IF NOT EXISTS doc_items(id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT, code, name, uom, price, qty, hsn, rate);
CREATE TABLE IF NOT EXISTS purchase_orders(id TEXT PRIMARY KEY, user_id INTEGER, no, date, supplier, warehouse, status, note);
CREATE TABLE IF NOT EXISTS po_items(id INTEGER PRIMARY KEY AUTOINCREMENT, po_id TEXT, code, name, uom, qty, price, rate, hsn);
CREATE TABLE IF NOT EXISTS compliance(doc_id TEXT PRIMARY KEY, user_id INTEGER, irn, ack_no, ack_date, irn_status, qr, eway_no, eway_valid, eway_status, vehicle, distance, mode);
CREATE TABLE IF NOT EXISTS gst_filings(id TEXT PRIMARY KEY, user_id INTEGER, kind, period, ref, status, mode, date);
CREATE TABLE IF NOT EXISTS lot_sales(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, doc_id TEXT, lot_id TEXT, product_id TEXT, qty REAL);
CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, date, ref, memo, source, source_id);
CREATE TABLE IF NOT EXISTS journal_lines(id INTEGER PRIMARY KEY AUTOINCREMENT, journal_id INTEGER, account, debit REAL, credit REAL, cleared INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, user_id INTEGER, kind, doc_id, party, amount REAL, date, mode, ref);
CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY, user_id INTEGER, date, account, amount REAL, gst REAL, mode, payee, note);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, actor_id INTEGER, actor, role, action, entity, entity_id, ip, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS periods(id TEXT PRIMARY KEY, user_id INTEGER, period, status, closed_by, closed_at, note, UNIQUE(user_id, period));
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, user_id INTEGER, name, category, purchase_date, cost REAL, salvage REAL, life_years REAL, acc_dep REAL DEFAULT 0, status);
CREATE TABLE IF NOT EXISTS asset_dep(id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id TEXT, period, amount REAL, UNIQUE(asset_id, period));
CREATE TABLE IF NOT EXISTS recurring(id TEXT PRIMARY KEY, user_id INTEGER, memo, frequency, next_date, lines, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS automation_rules(id TEXT PRIMARY KEY, user_id INTEGER, kind, name, enabled INTEGER DEFAULT 1, channel, param REAL);
CREATE TABLE IF NOT EXISTS automation_runs(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, rule_id, name, at TEXT DEFAULT CURRENT_TIMESTAMP, status, detail);
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, user_id INTEGER, dedupe, kind, title, detail, role, status, channel, link, created TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, dedupe));
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, user_id INTEGER, channel, recipient, subject, body, status, error, created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS credit_notes(id TEXT PRIMARY KEY, user_id INTEGER, no, date, invoice_id, cust, reason, restock INTEGER, taxable REAL, tax REAL, total REAL, warehouse);
CREATE TABLE IF NOT EXISTS credit_items(id INTEGER PRIMARY KEY AUTOINCREMENT, note_id TEXT, code, name, uom, qty REAL, price REAL, rate REAL, hsn, taxable REAL);
CREATE TABLE IF NOT EXISTS stock(user_id INTEGER, product_id TEXT, warehouse_id TEXT, qty REAL, PRIMARY KEY(user_id, product_id, warehouse_id));
CREATE TABLE IF NOT EXISTS movements(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, product_id TEXT, warehouse_id TEXT, qty REAL, kind TEXT, ref TEXT, date TEXT DEFAULT CURRENT_TIMESTAMP);
`)
// Upgrade databases created by older versions.
const MIG = { ...T, lots: [...T.lots, 'remaining'], company: COMPANY, docs: ['warehouse', 'status', 'stocked', 'created_by', 'centre'], expenses: ['centre'], doc_items: ['hsn', 'rate', 'lot'], users: ['owner_id', 'role'] }
for (const [t, cols] of Object.entries(MIG)) {
  const have = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name)
  cols.filter(c => !have.includes(c)).forEach(c => db.exec(`ALTER TABLE ${t} ADD COLUMN ${c}`))
}
db.exec("UPDATE docs SET status='approved', stocked=1 WHERE status IS NULL; UPDATE lots SET remaining=qty WHERE remaining IS NULL")

const norm = (c, v) => (v == null || v === '' ? (c === 'gst_rate' ? 18 : NUM.has(c) ? 0 : '') : typeof v === 'boolean' ? +v : NUM.has(c) ? Number(v) || 0 : v)
const out = r => ({ ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ''])), ...(r.manage !== undefined && { manage: !!r.manage }) })
const app = express()
app.set('trust proxy', 1)
app.use(cors()); app.use(express.json({ limit: '15mb' }))
app.get('/api/health', (_req, res) => res.json({ status: 'ok', emailConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM) }))
// Record-level audit trail: every successful change is logged with who, what, which record and from where.
app.use('/api', (req, res, next) => {
  const p = req.path.split('/').filter(Boolean)
  if (req.method !== 'GET') res.on('finish', () => {
    try {
      if (res.statusCode >= 400 || !req.uid) return
      const who = db.prepare('SELECT name FROM users WHERE id=?').get(req.me)
      db.prepare('INSERT INTO audit_log(user_id,actor_id,actor,role,action,entity,entity_id,ip) VALUES(?,?,?,?,?,?,?,?)').run(req.uid, req.me, who ? who.name : '', req.role, req.method + (p[2] ? ' ' + p.slice(2).join('/') : ''), p[0] || '', String(p[1] || (req.body && req.body.id) || ''), req.ip)
    } catch (e) {}
  })
  next()
})
const w = fn => (req, res) => { try { res.json(fn(req) ?? { ok: true }) } catch (e) { res.status(400).json({ error: e.message }) } }
const auth = (req, res, next) => {
  try {
    const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET)
    req.me = p.id; req.uid = p.tenant ?? p.id; req.role = p.role || 'admin'
    if (req.uid !== req.me && !db.prepare('SELECT 1 FROM users WHERE id=?').get(req.me)) throw new Error('removed')
    next()
  } catch { res.status(401).json({ error: 'Please sign in again' }) }
}
const need = (...roles) => (req, res, next) => (roles.includes(req.role) ? next() : res.status(403).json({ error: 'Your role does not have permission for this action' }))
const token = u => jwt.sign({ id: u.id, tenant: u.owner_id || u.id, role: u.role || 'admin' }, SECRET, { expiresIn: '7d' })
const pub = u => ({ id: u.id, name: u.name, business: u.business, email: u.email, role: u.role || 'admin' })

// ---------- Stock engine ----------
const defWh = uid => {
  let r = db.prepare('SELECT id FROM warehouses WHERE user_id=? ORDER BY rowid LIMIT 1').get(uid)
  if (!r) { r = { id: 'main-' + uid }; db.prepare('INSERT INTO warehouses(id,user_id,name,location) VALUES(?,?,?,?)').run(r.id, uid, 'Main warehouse', '') }
  return r.id
}
const adj = (uid, pid, wh, d, kind, ref, total = true) => {
  if (wh) db.prepare('INSERT INTO stock VALUES(?,?,?,?) ON CONFLICT(user_id,product_id,warehouse_id) DO UPDATE SET qty=MAX(0,qty+?)').run(uid, pid, wh, Math.max(0, d), d)
  if (total) db.prepare('UPDATE products SET qty=MAX(0,qty+?) WHERE id=? AND user_id=?').run(d, pid, uid)
  db.prepare('INSERT INTO movements(user_id,product_id,warehouse_id,qty,kind,ref) VALUES(?,?,?,?,?,?)').run(uid, pid, wh || '', d, kind, ref || '')
}
// Sell from the preferred lot first, then oldest lots first (FIFO), inside the dispatch warehouse.
const alloc = (uid, d, i, p, wh) => {
  let left = i.qty; const used = [], lots = db.prepare('SELECT * FROM lots WHERE user_id=? AND product_id=? AND warehouse_id=? AND remaining>0 ORDER BY received, rowid').all(uid, p.id, wh)
  if (i.lot) lots.sort((a, b) => (b.lot_no === i.lot) - (a.lot_no === i.lot))
  for (const l of lots) {
    if (left <= 0) break
    const q = Math.min(left, l.remaining)
    db.prepare('UPDATE lots SET remaining=remaining-? WHERE id=?').run(q, l.id)
    db.prepare('INSERT INTO lot_sales(user_id,doc_id,lot_id,product_id,qty) VALUES(?,?,?,?,?)').run(uid, d.id, l.id, p.id, q)
    used.push(`${l.lot_no}×${q}`); left -= q
  }
  return used.join(', ')
}
const tracked = (uid, pid) => { const p = db.prepare('SELECT * FROM products WHERE id=? AND user_id=?').get(pid, uid); return p && p.manage ? p : null }
// Approved invoices take stock from their warehouse, exactly once.
const deduct = (uid, id) => {
  const d = db.prepare('SELECT * FROM docs WHERE id=? AND user_id=?').get(id, uid)
  if (!d || d.stocked || d.type !== 'invoice' || d.status !== 'approved') return
  const wh = d.warehouse || defWh(uid)
  db.prepare('SELECT * FROM doc_items WHERE doc_id=?').all(id).forEach(i => {
    const p = db.prepare('SELECT id,manage FROM products WHERE code=? AND user_id=?').get(i.code, uid)
    if (p && p.manage) { adj(uid, p.id, wh, -i.qty, 'sale', d.no); db.prepare('UPDATE doc_items SET lot=? WHERE id=?').run(alloc(uid, d, i, p, wh) || i.lot || '', i.id) }
  })
  db.prepare('UPDATE docs SET stocked=1 WHERE id=?').run(id)
}

// ---------- Auth ----------
const sendMail = async ({ to, subject, text }) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.MAIL_FROM) return false
  const nm = await import('nodemailer')
  const port = Number(process.env.SMTP_PORT) || 587
  const transport = nm.default.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 })
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text })
  return true
}
const authAlert = async (kind, u, req) => {
  const when = new Date().toISOString(), ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'
  const details = [`Event: ${kind}`, `Name: ${u.name}`, `Business: ${u.business || '—'}`, `Email: ${u.email}`, `Role: ${u.role || 'admin'}`, `Time (UTC): ${when}`, `IP: ${ip}`, `Device: ${String(req.headers['user-agent'] || 'unknown').slice(0, 300)}`]
  const recipient = process.env.AUTH_ALERT_TO || 'rsha230121@gmail.com', subject = `Ledgerline: ${kind} — ${u.email}`, body = details.join('\n')
  try { if (await sendMail({ to: recipient, subject, text: body })) return true }
  catch (e) { console.error('Account alert email failed:', e.message) }
  try {
    db.prepare('INSERT INTO outbox(id,user_id,channel,recipient,subject,body,status,error) VALUES(?,?,?,?,?,?,?,?)')
      .run(crypto.randomUUID().slice(0, 8), u.owner_id || u.id, 'email', recipient, subject, body, 'queued', 'Awaiting successful SMTP delivery')
  } catch (e) { console.error('Could not queue account alert:', e.message) }
  return false
}
app.post('/api/signup', async (req, res) => {
 try {
  const { body: b } = req
  const email = String(b.email || '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address')
  if (String(b.password || '').length < 6) throw new Error('Password must be at least 6 characters')
  if (!b.name?.trim() || !b.business?.trim()) throw new Error('Enter your name and business name')
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw new Error('An account with this email already exists')
  const id = db.prepare("INSERT INTO users(name,business,email,phone,hash,role) VALUES(?,?,?,?,?,'admin')").run(b.name.trim(), b.business.trim(), email, b.phone || '', bcrypt.hashSync(b.password, 10)).lastInsertRowid
  db.prepare('INSERT INTO company(user_id,name,phone) VALUES(?,?,?)').run(id, b.business.trim(), b.phone || ''); defWh(id)
  const u = { id, name: b.name.trim(), business: b.business.trim(), email, role: 'admin' }
  const emailSent = await authAlert('new account created', u, req)
  res.json({ token: token(u), user: pub(u), emailSent })
 } catch(e) { res.status(400).json({ error: e.message }) }
})
app.post('/api/login', async (req, res) => {
 try {
  const { body: b, ip } = req
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(b.email || '').trim().toLowerCase())
  if (!u || !bcrypt.compareSync(String(b.password || ''), u.hash)) throw new Error('Incorrect email or password')
  db.prepare("INSERT INTO audit_log(user_id,actor_id,actor,role,action,entity,entity_id,ip) VALUES(?,?,?,?,'login','session','',?)").run(u.owner_id || u.id, u.id, u.name, u.role || 'admin', ip)
  const emailSent = await authAlert('login', u, req)
  res.json({ token: token(u), user: pub(u), emailSent })
 } catch(e) { res.status(400).json({ error: e.message }) }
})
app.post('/api/password/forgot', async (req, res) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.MAIL_FROM) return res.status(503).json({ error: 'Password recovery email is not configured on the server yet.' })
  const email = String(req.body.email || '').trim().toLowerCase()
  const u = db.prepare('SELECT id,email FROM users WHERE email=?').get(email)
  if (u) {
    const raw = crypto.randomBytes(32).toString('hex'), digest = crypto.createHash('sha256').update(raw).digest('hex')
    db.prepare('DELETE FROM password_resets WHERE user_id=?').run(u.id)
    db.prepare('INSERT INTO password_resets(token_hash,user_id,expires) VALUES(?,?,?)').run(digest, u.id, Date.now() + 3600000)
    const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '')
    try {
      const sent = await sendMail({ to: u.email, subject: 'Reset your Ledgerline password', text: `Use this link within one hour to reset your password:\n${base}/?reset=${raw}` })
      if (!sent) throw new Error('Email provider is not configured')
    } catch(e) {
      db.prepare('DELETE FROM password_resets WHERE user_id=?').run(u.id)
      console.error('Password reset email failed:', e.message)
      return res.status(503).json({ error: 'We could not send the recovery email. Please try again later or contact the administrator.' })
    }
  }
  res.json({ ok: true, message: 'If that email has an account, a password reset link is on its way.' })
})
app.post('/api/password/reset', w(({ body: b }) => {
  const raw = String(b.token || ''), password = String(b.password || '')
  if (password.length < 6) throw new Error('Password must be at least 6 characters')
  const digest = crypto.createHash('sha256').update(raw).digest('hex')
  const reset = db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND expires>?').get(digest, Date.now())
  if (!reset) throw new Error('This reset link is invalid or has expired. Request a new one.')
  db.prepare('UPDATE users SET hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), reset.user_id)
  db.prepare('DELETE FROM password_resets WHERE user_id=?').run(reset.user_id)
  return { ok: true }
}))

// ---------- Accounting ----------
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100
const NEW_CODES = ['1500', '1510', '6050']  // added after the first release; existing businesses receive them too
const ensureAccounts = uid => {
  const fresh = !db.prepare('SELECT 1 FROM accounts WHERE user_id=?').get(uid)
  CHART.filter(([code]) => fresh || NEW_CODES.includes(code)).forEach(([code, name, type]) => { if (!db.prepare('SELECT 1 FROM accounts WHERE user_id=? AND code=?').get(uid, code)) db.prepare('INSERT INTO accounts(id,user_id,code,name,type) VALUES(?,?,?,?,?)').run(`${uid}-${code}`, uid, code, name, type) })
}
const ruleOn = (uid, kind) => { const r = db.prepare('SELECT enabled FROM automation_rules WHERE user_id=? AND kind=?').get(uid, kind); return !r || !!r.enabled }
const isClosed = (uid, date) => !!db.prepare("SELECT 1 FROM periods WHERE user_id=? AND period=? AND status='closed'").get(uid, String(date).slice(0, 7))
const post = (uid, e) => {
  assertBalanced(e.lines)
  if (isClosed(uid, e.date)) throw new Error(`The period ${String(e.date).slice(0, 7)} is closed. Ask an admin to reopen it, or use a date in an open period.`)
  const jid = db.prepare('INSERT INTO journal(user_id,date,ref,memo,source,source_id) VALUES(?,?,?,?,?,?)').run(uid, e.date, e.ref || '', e.memo || '', e.source || 'manual', e.source_id || '').lastInsertRowid
  const ins = db.prepare('INSERT INTO journal_lines(journal_id,account,debit,credit) VALUES(?,?,?,?)')
  e.lines.forEach(l => ins.run(jid, l.account, l.debit || 0, l.credit || 0))
  return jid
}
const paidSum = id => db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE doc_id=?').get(id).s
const docTotal = (uid, id) => { const d = db.prepare('SELECT * FROM docs WHERE id=? AND user_id=?').get(id, uid); return d ? totals(d, db.prepare('SELECT * FROM doc_items WHERE doc_id=?').all(id)).total : 0 }
const poTotal = id => totals({ discount: 0 }, db.prepare('SELECT * FROM po_items WHERE po_id=?').all(id)).total
const outstandingOf = (uid, cust) => db.prepare("SELECT id FROM docs WHERE user_id=? AND cust=? AND type='invoice' AND status IN ('approved','pending')").all(uid, cust).reduce((a, x) => a + docTotal(uid, x.id) - paidSum(x.id), 0)
const posted = (uid, source, id) => db.prepare('SELECT 1 FROM journal WHERE user_id=? AND source=? AND source_id=?').get(uid, source, id)
// An approved invoice books sales, GST payable, receivable and the cost of goods sold, once.
const postInvoice = (uid, id) => {
  const d = db.prepare('SELECT * FROM docs WHERE id=? AND user_id=?').get(id, uid)
  if (!d || d.type !== 'invoice' || d.status !== 'approved' || posted(uid, 'invoice', id)) return
  const items = db.prepare('SELECT * FROM doc_items WHERE doc_id=?').all(id)
  const cogs = r2(items.reduce((a, i) => { const p = db.prepare('SELECT cost,manage FROM products WHERE code=? AND user_id=?').get(i.code, uid); return a + (p && p.manage ? (p.cost || 0) * i.qty : 0) }, 0))
  post(uid, { date: d.date, ref: `INV ${d.no}`, memo: 'Sales invoice', source: 'invoice', source_id: id, lines: invoiceEntry(totals(d, items), cogs) })
}
const postPO = (uid, po) => {
  if (posted(uid, 'purchase', po.id)) return
  post(uid, { date: po.date, ref: `PO ${po.no}`, memo: 'Goods received', source: 'purchase', source_id: po.id, lines: poEntry(totals({ discount: 0 }, db.prepare('SELECT * FROM po_items WHERE po_id=?').all(po.id))) })
}
const recordPayment = (uid, b) => db.transaction(() => {
  const kind = b.kind === 'payment' ? 'payment' : 'receipt', amt = r2(Number(b.amount))
  if (!(amt > 0)) throw new Error('Enter an amount above zero')
  const doc = kind === 'receipt' ? db.prepare("SELECT * FROM docs WHERE id=? AND user_id=? AND type='invoice' AND status='approved'").get(b.doc_id, uid) : db.prepare("SELECT * FROM purchase_orders WHERE id=? AND user_id=? AND status='received'").get(b.doc_id, uid)
  if (!doc) throw new Error(kind === 'receipt' ? 'Payments can be recorded on approved invoices' : 'Receive the goods first: the payable is created on receipt')
  const total = kind === 'receipt' ? docTotal(uid, doc.id) : poTotal(doc.id), paid = paidSum(doc.id), mode = b.mode === 'bank' ? 'bank' : 'cash', date = b.date || new Date().toISOString().slice(0, 10)
  if (amt > r2(total - paid) + 0.005) throw new Error(`Only ${r2(total - paid).toFixed(2)} is outstanding`)
  db.prepare('INSERT INTO payments(id,user_id,kind,doc_id,party,amount,date,mode,ref) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID().slice(0, 8), uid, kind, doc.id, kind === 'receipt' ? doc.cust : doc.supplier, amt, date, mode, b.ref || '')
  post(uid, { date, ref: `${kind === 'receipt' ? 'RCPT' : 'PAY'} ${doc.no}`, memo: b.ref || '', source: kind, source_id: doc.id, lines: kind === 'receipt' ? receiptEntry(amt, mode) : supplierPayEntry(amt, mode) })
  if (kind === 'receipt' && paid + amt >= total - 0.005) db.prepare('UPDATE docs SET paid=1 WHERE id=?').run(doc.id)
})()
// Bring databases from earlier versions into the ledger once.
db.transaction(() => {
  db.prepare('SELECT DISTINCT user_id FROM docs UNION SELECT DISTINCT user_id FROM purchase_orders').all().forEach(({ user_id: uid }) => {
    ensureAccounts(uid)
    db.prepare("SELECT id FROM docs WHERE user_id=? AND type='invoice' AND status='approved'").all(uid).forEach(x => postInvoice(uid, x.id))
    db.prepare("SELECT * FROM docs WHERE user_id=? AND type='invoice' AND status='approved' AND paid=1 AND id NOT IN (SELECT doc_id FROM payments)").all(uid).forEach(d => recordPayment(uid, { kind: 'receipt', doc_id: d.id, amount: docTotal(uid, d.id), date: d.date, mode: 'cash', ref: 'Opening' }))
    db.prepare("SELECT * FROM purchase_orders WHERE user_id=? AND status='received'").all(uid).forEach(po => postPO(uid, po))
  })
})()

// ---------- Data ----------
const all = (uid, role) => {
  defWh(uid); ensureAccounts(uid); ensureRules(db, uid)
  const rows = t => db.prepare(`SELECT * FROM ${t} WHERE user_id=?`).all(uid).map(({ user_id, ...r }) => out(r))
  const items = db.prepare('SELECT * FROM doc_items WHERE doc_id=?')
  const docs = rows('docs').map(d => { const its = items.all(d.id).map(({ id, doc_id, ...i }) => ({ ...i, rate: i.rate === '' || i.rate == null ? 18 : Number(i.rate) })); return { ...d, paid: !!d.paid, discount: Number(d.discount) || 0, status: d.status || 'approved', items: its, total: totals(d, its).total, paid_amt: paidSum(d.id) } })
  const cni = db.prepare('SELECT code,name,uom,qty,price,rate,hsn,taxable FROM credit_items WHERE note_id=?')
  const credit_notes = rows('credit_notes').map(n => ({ ...n, restock: !!n.restock, items: cni.all(n.id) }))
  const poi = db.prepare('SELECT * FROM po_items WHERE po_id=?')
  const pos = rows('purchase_orders').map(p => ({ ...p, items: poi.all(p.id).map(({ id, po_id, ...i }) => i), total: poTotal(p.id), paid_amt: paidSum(p.id) }))
  const { user_id, ...company } = db.prepare('SELECT * FROM company WHERE user_id=?').get(uid) || {}
  return {
    company: { ...out(company), einvoice: !!company.einvoice }, customers: rows('customers'), drivers: rows('drivers'), products: rows('products'), lots: rows('lots'), warehouses: rows('warehouses'), docs, suppliers: rows('suppliers'), credit_notes, leads: rows('leads'), accounts: rows('accounts'), centres: rows('centres'), budgets: rows('budgets'), periods: rows('periods'), assets: rows('assets'),
    recurring: rows('recurring').map(r => ({ ...r, active: !!r.active, lines: JSON.parse(r.lines || '[]') })), rules: rows('automation_rules').map(r => ({ ...r, enabled: !!r.enabled })),
    tasks: db.prepare('SELECT id,kind,title,detail,role,status,channel,link,created FROM tasks WHERE user_id=? ORDER BY created DESC LIMIT 150').all(uid),
    runs: db.prepare('SELECT id,rule_id,name,at,status,detail FROM automation_runs WHERE user_id=? ORDER BY id DESC LIMIT 100').all(uid),
    outbox: db.prepare('SELECT id,channel,recipient,subject,status,error,created FROM outbox WHERE user_id=? ORDER BY created DESC LIMIT 50').all(uid), expenses: rows('expenses'), payments: rows('payments'), pos,
    ledger: db.prepare('SELECT l.id,l.journal_id,j.date,j.ref,j.memo,j.source,l.account,l.debit,l.credit,l.cleared FROM journal_lines l JOIN journal j ON j.id=l.journal_id WHERE j.user_id=? ORDER BY j.date,l.id').all(uid), compliance: rows('compliance'), filings: rows('gst_filings'),
    lot_sales: db.prepare('SELECT doc_id,lot_id,product_id,qty FROM lot_sales WHERE user_id=?').all(uid), gst_mode: process.env.GST_MODE === 'live' ? 'live' : 'sandbox',
    stock: db.prepare('SELECT product_id,warehouse_id,qty FROM stock WHERE user_id=?').all(uid),
    movements: db.prepare('SELECT product_id,warehouse_id,qty,kind,ref,date FROM movements WHERE user_id=? ORDER BY id DESC LIMIT 100').all(uid),
    team: role === 'admin' ? db.prepare('SELECT id,name,email,role FROM users WHERE owner_id=?').all(uid) : [],
  }
}
app.get('/api/all', auth, w(req => all(req.uid, req.role)))
app.put('/api/company', auth, need('admin'), w(({ uid, body: b }) => {
  db.prepare(`INSERT INTO company(user_id,${COMPANY}) VALUES(@uid,${COMPANY.map(c => '@' + c)}) ON CONFLICT(user_id) DO UPDATE SET ${COMPANY.map(c => `${c}=@${c}`)}`)
    .run({ uid, ...Object.fromEntries(COMPANY.map(c => [c, norm(c, b[c])])) })
}))

for (const [t, cols] of Object.entries(T)) {
  const p = (uid, b, id) => ({ id, uid, ...Object.fromEntries(cols.map(c => [c, norm(c, b[c])])) })
  app.post(`/api/${t}`, auth, need(...(WRW[t] || W)), w(({ uid, body: b }) => {
    db.transaction(() => {
      if (t === 'lots') b = { ...b, warehouse_id: b.warehouse_id || defWh(uid) }
      db.prepare(`INSERT INTO ${t}(id,user_id,${cols}) VALUES(@id,@uid,${cols.map(c => '@' + c)})`).run(p(uid, b, String(b.id)))
      if (t === 'lots') db.prepare('UPDATE lots SET remaining=qty WHERE id=?').run(String(b.id))
      if (t === 'lots' && tracked(uid, b.product_id)) adj(uid, b.product_id, b.warehouse_id, Number(b.qty) || 0, 'lot', b.lot_no)
    })()
  }))
  app.put(`/api/${t}/:id`, auth, need(...(WRW[t] && t !== 'customers' ? WRW[t] : W)), w(({ uid, body: b, params }) => {
    db.prepare(`UPDATE ${t} SET ${cols.map(c => `${c}=@${c}`)} WHERE id=@id AND user_id=@uid`).run(p(uid, b, params.id))
  }))
  app.delete(`/api/${t}/:id`, auth, need(...(WRW[t] && t !== 'customers' ? WRW[t] : W)), w(({ uid, params }) => {
    db.transaction(() => {
      if (t === 'lots') { const l = db.prepare('SELECT * FROM lots WHERE id=? AND user_id=?').get(params.id, uid); if (l && l.remaining < l.qty) throw new Error('Part of this lot has already been sold and cannot be deleted'); if (l && tracked(uid, l.product_id)) adj(uid, l.product_id, l.warehouse_id, -l.qty, 'lot_removed', l.lot_no) }
      if (t === 'products') { db.prepare('DELETE FROM lots WHERE product_id=? AND user_id=?').run(params.id, uid); db.prepare('DELETE FROM stock WHERE product_id=? AND user_id=?').run(params.id, uid) }
      if (t === 'warehouses') {
        if (db.prepare('SELECT 1 FROM stock WHERE warehouse_id=? AND user_id=? AND qty>0').get(params.id, uid)) throw new Error('Move stock out of this warehouse before deleting it')
        if (db.prepare('SELECT COUNT(*) c FROM warehouses WHERE user_id=?').get(uid).c < 2) throw new Error('Keep at least one warehouse')
      }
      if (t === 'accounts' && db.prepare('SELECT 1 FROM journal_lines l JOIN journal j ON j.id=l.journal_id WHERE j.user_id=? AND l.account=(SELECT code FROM accounts WHERE id=?)').get(uid, params.id)) throw new Error('This account has postings and cannot be deleted')
      db.prepare(`DELETE FROM ${t} WHERE id=? AND user_id=?`).run(params.id, uid)
    })()
  }))
}

app.post('/api/transfer', auth, need(...W), w(({ uid, body: b }) => {
  const q = Number(b.qty)
  if (!(q > 0)) throw new Error('Enter a quantity above zero')
  if (!b.to || b.from === b.to) throw new Error('Choose two different warehouses')
  const p = tracked(uid, b.product_id)
  if (!p) throw new Error('Stock is not tracked for this product')
  const have = b.from ? (db.prepare('SELECT qty FROM stock WHERE user_id=? AND product_id=? AND warehouse_id=?').get(uid, p.id, b.from)?.qty || 0)
    : p.qty - db.prepare('SELECT COALESCE(SUM(qty),0) s FROM stock WHERE user_id=? AND product_id=?').get(uid, p.id).s
  if (q > have) throw new Error(`Only ${have} available in the source warehouse`)
  db.transaction(() => { adj(uid, p.id, b.from, -q, 'transfer_out', b.note, false); adj(uid, p.id, b.to, q, 'transfer_in', b.note, false) })()
}))

// ---------- Invoices, quotations, approvals ----------
const saveDoc = db.transaction((uid, role, me, d) => {
  const ex = db.prepare('SELECT * FROM docs WHERE id=?').get(d.id)
  if (ex && ex.user_id !== uid) throw new Error('Not allowed')
  if (!Array.isArray(d.items) || !d.items.length) throw new Error('Add at least one product')
  const status = ex ? ex.status || 'approved' : d.type === 'invoice' && role === 'staff' ? 'pending' : 'approved'
  if (!ex && d.type === 'invoice' && role !== 'admin' && ruleOn(uid, 'credit_block')) {
    const cu = db.prepare('SELECT credit_limit FROM customers WHERE id=? AND user_id=?').get(d.cust, uid)
    if (cu && cu.credit_limit > 0) { const net = totals(d, d.items).total, out = outstandingOf(uid, d.cust); if (out + net > cu.credit_limit) throw new Error(`Credit limit exceeded: ${out.toFixed(2)} outstanding + ${net.toFixed(2)} is above the limit of ${cu.credit_limit}. Ask an admin to approve.`) }
  }
  db.prepare(`INSERT INTO docs(id,user_id,type,no,date,cust,driver,discount,paid,doc,warehouse,status,stocked,created_by,centre) VALUES(@id,@uid,@type,@no,@date,@cust,@driver,@discount,@paid,@doc,@warehouse,@status,0,@me,@centre)
    ON CONFLICT(id) DO UPDATE SET type=@type,no=@no,date=@date,cust=@cust,driver=@driver,discount=@discount,paid=@paid,doc=@doc,warehouse=@warehouse,centre=@centre`)
    .run({ id: d.id, uid, me, status, type: d.type, no: String(d.no), date: d.date, cust: d.cust || '', driver: d.driver || '', discount: Number(d.discount) || 0, paid: +!!d.paid, doc: d.doc || '', warehouse: d.warehouse || '', centre: d.centre || '' })
  db.prepare('DELETE FROM doc_items WHERE doc_id=?').run(d.id)
  const ins = db.prepare('INSERT INTO doc_items(doc_id,code,name,uom,price,qty,hsn,rate,lot) VALUES(?,?,?,?,?,?,?,?,?)')
  d.items.forEach(i => ins.run(d.id, i.code || '', i.name, i.uom, Number(i.price), Number(i.qty), i.hsn || '', i.rate == null ? 18 : Number(i.rate), i.lot || ''))
  deduct(uid, d.id); postInvoice(uid, d.id)
})
app.post('/api/docs', auth, need(...W, 'staff'), w(({ uid, role, me, body }) => saveDoc(uid, role, me, body)))
app.put('/api/docs/:id', auth, need(...W), w(({ uid, role, me, body, params }) => saveDoc(uid, role, me, { ...body, id: params.id })))
app.delete('/api/docs/:id', auth, need(...W), w(({ uid, params }) => {
  if (db.prepare('DELETE FROM docs WHERE id=? AND user_id=?').run(params.id, uid).changes) db.prepare('DELETE FROM doc_items WHERE doc_id=?').run(params.id)
}))
app.post('/api/docs/:id/approve', auth, need(...W), w(({ uid, params }) => {
  db.transaction(() => {
    if (!db.prepare("UPDATE docs SET status='approved' WHERE id=? AND user_id=? AND status='pending'").run(params.id, uid).changes) throw new Error('This invoice is not waiting for approval')
    deduct(uid, params.id); postInvoice(uid, params.id)
  })()
}))
app.post('/api/docs/:id/reject', auth, need(...W), w(({ uid, params }) => {
  db.prepare("UPDATE docs SET status='rejected' WHERE id=? AND user_id=? AND status='pending'").run(params.id, uid)
}))

// ---------- Team & roles ----------
app.post('/api/team', auth, need('admin'), w(({ uid, body: b }) => {
  const email = String(b.email || '').trim().toLowerCase()
  if (!b.name?.trim()) throw new Error('Enter the team member’s name')
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address')
  if (String(b.password || '').length < 6) throw new Error('Password must be at least 6 characters')
  if (!['manager', 'accountant', 'staff', 'viewer', 'ceo'].includes(b.role)) throw new Error('Choose a role')
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw new Error('This email is already registered')
  const o = db.prepare('SELECT business FROM users WHERE id=?').get(uid)
  db.prepare('INSERT INTO users(name,business,email,phone,hash,owner_id,role) VALUES(?,?,?,?,?,?,?)').run(b.name.trim(), o.business, email, '', bcrypt.hashSync(b.password, 10), uid, b.role)
}))
app.delete('/api/team/:id', auth, need('admin'), w(({ uid, params }) => { db.prepare('DELETE FROM users WHERE id=? AND owner_id=?').run(params.id, uid) }))

// ---------- Purchase orders ----------
const aw = fn => async (req, res) => { try { res.json((await fn(req)) ?? { ok: true }) } catch (e) { res.status(400).json({ error: e.message }) } }
const savePo = db.transaction((uid, p) => {
  const ex = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(p.id)
  if (ex && ex.user_id !== uid) throw new Error('Not allowed')
  if (ex && ex.status !== 'draft') throw new Error('Only draft purchase orders can be edited')
  if (!Array.isArray(p.items) || !p.items.length) throw new Error('Add at least one product')
  if (!p.supplier) throw new Error('Select a supplier')
  db.prepare(`INSERT INTO purchase_orders(id,user_id,no,date,supplier,warehouse,status,note) VALUES(@id,@uid,@no,@date,@supplier,@warehouse,'draft',@note)
    ON CONFLICT(id) DO UPDATE SET no=@no,date=@date,supplier=@supplier,warehouse=@warehouse,note=@note`).run({ id: p.id, uid, no: String(p.no), date: p.date, supplier: p.supplier, warehouse: p.warehouse || '', note: p.note || '' })
  db.prepare('DELETE FROM po_items WHERE po_id=?').run(p.id)
  const ins = db.prepare('INSERT INTO po_items(po_id,code,name,uom,qty,price,rate,hsn) VALUES(?,?,?,?,?,?,?,?)')
  p.items.forEach(i => ins.run(p.id, i.code || '', i.name, i.uom || 'Unit', Number(i.qty), Number(i.price), i.rate == null ? 18 : Number(i.rate), i.hsn || ''))
})
app.post('/api/pos', auth, need(...W), w(({ uid, body }) => savePo(uid, body)))
app.put('/api/pos/:id', auth, need(...W), w(({ uid, body, params }) => savePo(uid, { ...body, id: params.id })))
app.delete('/api/pos/:id', auth, need(...W), w(({ uid, params }) => {
  if (db.prepare("DELETE FROM purchase_orders WHERE id=? AND user_id=? AND status='draft'").run(params.id, uid).changes) db.prepare('DELETE FROM po_items WHERE po_id=?').run(params.id)
  else throw new Error('Only draft purchase orders can be deleted')
}))
// Orders above the company's approval limit go to an admin first (multi-level approval).
app.post('/api/pos/:id/send', auth, need(...W), w(({ uid, role, params }) => {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id=? AND user_id=?').get(params.id, uid)
  if (!po || !['draft', 'approved'].includes(po.status)) return
  const lim = Number((db.prepare('SELECT po_limit FROM company WHERE user_id=?').get(uid) || {}).po_limit) || 0
  const next = po.status === 'draft' && lim > 0 && ruleOn(uid, 'po_over_limit') && poTotal(po.id) > lim && role !== 'admin' ? 'awaiting_approval' : 'sent'
  db.prepare('UPDATE purchase_orders SET status=? WHERE id=?').run(next, po.id)
  return { status: next }
}))
app.post('/api/pos/:id/approve', auth, need('admin'), w(({ uid, params }) => { db.prepare("UPDATE purchase_orders SET status='approved' WHERE id=? AND user_id=? AND status='awaiting_approval'").run(params.id, uid) }))
app.post('/api/pos/:id/reject', auth, need('admin'), w(({ uid, params }) => { db.prepare("UPDATE purchase_orders SET status='draft' WHERE id=? AND user_id=? AND status='awaiting_approval'").run(params.id, uid) }))
// Receiving goods creates a lot per line in the chosen warehouse and raises stock.
app.post('/api/pos/:id/receive', auth, need(...W), w(({ uid, params }) => {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id=? AND user_id=?').get(params.id, uid)
  if (!po) throw new Error('Purchase order not found')
  if (po.status === 'received') throw new Error('Goods were already received for this order')
  if (po.status === 'awaiting_approval') throw new Error('This purchase order is waiting for approval')
  let created = 0, skipped = 0
  db.transaction(() => {
    const wh = po.warehouse || defWh(uid), day = new Date().toISOString().slice(0, 10)
    db.prepare('SELECT * FROM po_items WHERE po_id=?').all(po.id).forEach((i, k) => {
      const p = db.prepare('SELECT * FROM products WHERE code=? AND user_id=?').get(i.code, uid)
      if (!p) { skipped++; return }
      db.prepare('INSERT INTO lots(id,user_id,lot_no,product_id,qty,received,note,warehouse_id,expiry,remaining) VALUES(?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID().slice(0, 8), uid, `${po.no}-${k + 1}`, p.id, i.qty, day, `Received against ${po.no}`, wh, '', i.qty)
      if (p.manage) adj(uid, p.id, wh, i.qty, 'lot', po.no)
      created++
    })
    db.prepare("UPDATE purchase_orders SET status='received' WHERE id=?").run(po.id); postPO(uid, po)
  })()
  return { created, skipped }
}))

// ---------- E-invoice, e-way bill and GST filing ----------
const bundle = (uid, id) => {
  const d = db.prepare('SELECT * FROM docs WHERE id=? AND user_id=?').get(id, uid)
  if (!d) throw new Error('Invoice not found')
  return { d, items: db.prepare('SELECT * FROM doc_items WHERE doc_id=?').all(id), co: db.prepare('SELECT * FROM company WHERE user_id=?').get(uid) || {},
    cu: db.prepare('SELECT * FROM customers WHERE id=? AND user_id=?').get(d.cust, uid) || {}, comp: db.prepare('SELECT * FROM compliance WHERE doc_id=?').get(id) }
}
const saveComp = (uid, id, patch) => {
  const base = { doc_id: id, user_id: uid, irn: '', ack_no: '', ack_date: '', irn_status: '', qr: '', eway_no: '', eway_valid: '', eway_status: '', vehicle: '', distance: 0, mode: '' }
  const cur = db.prepare('SELECT * FROM compliance WHERE doc_id=?').get(id) || {}
  db.prepare('INSERT OR REPLACE INTO compliance(doc_id,user_id,irn,ack_no,ack_date,irn_status,qr,eway_no,eway_valid,eway_status,vehicle,distance,mode) VALUES(@doc_id,@user_id,@irn,@ack_no,@ack_date,@irn_status,@qr,@eway_no,@eway_valid,@eway_status,@vehicle,@distance,@mode)').run({ ...base, ...cur, ...patch })
}
const within24h = iso => iso && Date.now() - new Date(iso).getTime() <= 864e5
app.get('/api/docs/:id/einvoice', auth, need(...W), aw(({ uid, params }) => { const b = bundle(uid, params.id); return buildEinvoice(b.d, b.items, b.co, b.cu) }))
app.post('/api/docs/:id/einvoice', auth, need(...W), aw(async ({ uid, params }) => {
  const b = bundle(uid, params.id)
  if (b.d.status !== 'approved') throw new Error('Only approved invoices can be e-invoiced')
  if (b.comp?.irn_status === 'active') throw new Error('This invoice already has an IRN')
  if (b.comp?.irn_status === 'cancelled') throw new Error('A cancelled invoice number cannot be reported again. Issue a new invoice.')
  const payload = buildEinvoice(b.d, b.items, b.co, b.cu)
  const r = await gsp('einvoice', payload, { irn: irnOf(b.co.gst, b.d.date, 'INV', b.d.no) })
  saveComp(uid, params.id, { irn: r.irn, ack_no: r.ackNo, ack_date: r.ackDt, irn_status: 'active', qr: r.qr, mode: r.mode })
}))
app.post('/api/docs/:id/einvoice/cancel', auth, need(...W), aw(async ({ uid, params, body }) => {
  const b = bundle(uid, params.id)
  if (b.comp?.irn_status !== 'active') throw new Error('There is no active IRN to cancel')
  if (!within24h(b.comp.ack_date)) throw new Error('An IRN can be cancelled only within 24 hours. Issue a credit note instead.')
  if (b.comp.eway_status === 'active') throw new Error('Cancel the linked e-way bill first')
  await gsp('cancel-einvoice', { Irn: b.comp.irn, CnlRsn: body.reason || '1', CnlRem: body.remark || 'Cancelled' })
  saveComp(uid, params.id, { irn_status: 'cancelled' })
}))
app.get('/api/docs/:id/eway', auth, need(...W), aw(({ uid, params, query }) => { const b = bundle(uid, params.id); return buildEway(b.d, b.items, b.co, b.cu, query) }))
app.post('/api/docs/:id/eway', auth, need(...W), aw(async ({ uid, params, body }) => {
  const b = bundle(uid, params.id)
  if (b.d.status !== 'approved') throw new Error('Only approved invoices can have an e-way bill')
  if (b.comp?.eway_status === 'active') throw new Error('An e-way bill already exists for this invoice')
  const payload = buildEway(b.d, b.items, b.co, b.cu, body), r = await gsp('eway', payload, { distance: Number(body.distance) })
  saveComp(uid, params.id, { eway_no: r.ewbNo, eway_valid: r.validTill, eway_status: 'active', vehicle: String(body.vehicle).toUpperCase(), distance: Number(body.distance), mode: r.mode })
}))
app.post('/api/docs/:id/eway/cancel', auth, need(...W), aw(async ({ uid, params }) => {
  const b = bundle(uid, params.id)
  if (b.comp?.eway_status !== 'active') throw new Error('There is no active e-way bill')
  await gsp('cancel-eway', { ewbNo: b.comp.eway_no, cancelRsnCode: 2, cancelRmrk: 'Data entry mistake' })
  saveComp(uid, params.id, { eway_status: 'cancelled' })
}))
app.post('/api/gst/filing', auth, need(...W), aw(async ({ uid, body }) => {
  if (!['GSTR1', 'GSTR3B'].includes(body.kind) || !/^\d{4}-\d{2}$/.test(body.period || '')) throw new Error('Choose a return and a period')
  const r = await gsp('gstr', body.payload, { kind: body.kind })
  db.prepare('INSERT INTO gst_filings(id,user_id,kind,period,ref,status,mode,date) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID().slice(0, 8), uid, body.kind, body.period, r.ref, r.mode === 'live' ? 'Submitted to GSP' : 'Simulated', r.mode, new Date().toISOString())
}))

mount(app, { db, auth, need, w, post, adj, defWh, tracked, recordPayment, r2 })
const { runRecurring } = mountFinance(app, { db, auth, need, w, post, r2 })
mountReturns(app, { db, auth, need, w, post, adj, defWh, r2, paidSum, docTotal })
mountAutomation(app, { db, auth, need, w, aw, all, runRecurring })

app.use(express.static(path.join(dir, '../dist')))
app.get('*', (req, res) => res.sendFile(path.join(dir, '../dist/index.html')))
app.listen(process.env.PORT || 3001, () => console.log('Ledgerline running on port ' + (process.env.PORT || 3001)))

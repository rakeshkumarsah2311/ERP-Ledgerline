import crypto from 'crypto'
import { expenseEntry, adjustEntry } from './accounting.js'

// Finance, stock-count, audit and backup endpoints.
export function mount(app, { db, auth, need, w, post, adj, defWh, tracked, recordPayment, r2 }) {
  const FIN = ['admin', 'manager', 'accountant'], today = () => new Date().toISOString().slice(0, 10)
  const acct = (uid, code) => db.prepare('SELECT * FROM accounts WHERE user_id=? AND code=?').get(uid, String(code))

  app.post('/api/payments', auth, need(...FIN), w(({ uid, body }) => recordPayment(uid, body)))

  app.post('/api/expenses', auth, need(...FIN), w(({ uid, body: b }) => {
    const a = acct(uid, b.account), amount = r2(Number(b.amount)), gst = r2(Number(b.gst) || 0), mode = b.mode === 'bank' ? 'bank' : 'cash'
    if (!a || a.type !== 'expense') throw new Error('Choose an expense account')
    if (!(amount > 0) || gst < 0) throw new Error('Enter a valid amount')
    db.transaction(() => {
      const id = crypto.randomUUID().slice(0, 8), date = b.date || today()
      db.prepare('INSERT INTO expenses(id,user_id,date,account,amount,gst,mode,payee,note,centre) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, uid, date, a.code, amount, gst, mode, b.payee || '', b.note || '', b.centre || '')
      post(uid, { date, ref: `EXP ${a.name}`, memo: b.payee || b.note || '', source: 'expense', source_id: id, lines: expenseEntry(a.code, amount, gst, mode) })
    })()
  }))

  app.post('/api/journal', auth, need(...FIN), w(({ uid, body: b }) => {
    const lines = (b.lines || []).map(l => ({ account: String(l.account), debit: r2(Number(l.debit) || 0), credit: r2(Number(l.credit) || 0) })).filter(l => l.debit || l.credit)
    lines.forEach(l => { if (!acct(uid, l.account)) throw new Error(`Unknown account ${l.account}`) })
    post(uid, { date: b.date || today(), ref: b.ref || 'Manual journal', memo: b.memo || '', source: 'manual', source_id: '', lines })
  }))

  // Mark bank/cash lines as cleared against a statement.
  app.post('/api/ledger/clear', auth, need(...FIN), w(({ uid, body: b }) => {
    const ids = (b.ids || []).map(Number).filter(Number.isInteger); if (!ids.length) return
    db.prepare(`UPDATE journal_lines SET cleared=? WHERE id IN (${ids.map(() => '?').join(',')}) AND journal_id IN (SELECT id FROM journal WHERE user_id=?)`).run(b.cleared ? 1 : 0, ...ids, uid)
  }))

  // Physical stock count: differences become stock adjustments and an inventory journal entry at cost.
  app.post('/api/stock/adjust', auth, need('admin', 'manager'), w(({ uid, body: b }) => {
    if (!b.warehouse_id) throw new Error('Choose a warehouse')
    let value = 0, n = 0
    db.transaction(() => {
      for (const l of b.lines || []) {
        const p = tracked(uid, l.product_id); if (!p || l.counted === '' || l.counted == null) continue
        const counted = Number(l.counted); if (!(counted >= 0)) throw new Error('Counted quantities cannot be negative')
        const cur = (db.prepare('SELECT qty FROM stock WHERE user_id=? AND product_id=? AND warehouse_id=?').get(uid, p.id, b.warehouse_id) || {}).qty || 0, diff = counted - cur
        if (!diff) continue
        adj(uid, p.id, b.warehouse_id, diff, 'count', b.reason || 'Stock count'); value += diff * (p.cost || 0); n++
      }
      value = r2(value); if (value) post(uid, { date: today(), ref: 'Stock count', memo: b.reason || '', source: 'adjustment', source_id: '', lines: adjustEntry(value) })
    })()
    return { adjusted: n }
  }))

  app.get('/api/audit', auth, need('admin', 'manager'), w(({ uid }) => db.prepare('SELECT id,actor,role,action,entity,entity_id,ip,at FROM audit_log WHERE user_id=? ORDER BY id DESC LIMIT 500').all(uid)))

  // Tenant backup and restore (JSON). Autoincrement ids are re-issued on restore.
  const TBL = ['company', 'customers', 'drivers', 'products', 'lots', 'warehouses', 'suppliers', 'leads', 'accounts', 'docs', 'purchase_orders', 'stock', 'movements', 'compliance', 'gst_filings', 'lot_sales', 'journal', 'expenses', 'payments', 'centres', 'budgets', 'periods', 'assets', 'recurring', 'automation_rules', 'automation_runs', 'tasks', 'outbox', 'credit_notes']
  const CHILD = { doc_items: ['docs', 'doc_id'], po_items: ['purchase_orders', 'po_id'], journal_lines: ['journal', 'journal_id'], asset_dep: ['assets', 'asset_id'], credit_items: ['credit_notes', 'note_id'] }
  const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name)
  app.get('/api/backup', auth, need('admin'), w(({ uid }) => ({
    app: 'ledgerline', version: 1, at: new Date().toISOString(),
    tables: Object.fromEntries(TBL.map(t => [t, db.prepare(`SELECT * FROM ${t} WHERE user_id=?`).all(uid)])),
    children: Object.fromEntries(Object.entries(CHILD).map(([t, [p, fk]]) => [t, db.prepare(`SELECT * FROM ${t} WHERE ${fk} IN (SELECT id FROM ${p} WHERE user_id=?)`).all(uid)])),
  })))
  app.post('/api/restore', auth, need('admin'), w(({ uid, body: b }) => {
    if (b.app !== 'ledgerline' || !b.tables) throw new Error('This is not a Ledgerline backup file')
    db.transaction(() => {
      for (const [t, [p, fk]] of Object.entries(CHILD)) db.prepare(`DELETE FROM ${t} WHERE ${fk} IN (SELECT id FROM ${p} WHERE user_id=?)`).run(uid)
      for (const t of TBL) db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(uid)
      const jmap = {}, put = (t, row, skip = []) => { const cs = cols(t).filter(c => !skip.includes(c) && c in row); return db.prepare(`INSERT INTO ${t}(${cs}) VALUES(${cs.map(() => '?')})`).run(...cs.map(c => (c === 'user_id' ? uid : row[c]))) }
      for (const t of TBL) for (const r of b.tables[t] || []) { const res = put(t, { ...r, user_id: uid }, ['movements', 'lot_sales', 'journal', 'automation_runs'].includes(t) ? ['id'] : []); if (t === 'journal') jmap[r.id] = res.lastInsertRowid }
      for (const [t, [, fk]] of Object.entries(CHILD)) for (const r of (b.children || {})[t] || []) put(t, t === 'journal_lines' ? { ...r, journal_id: jmap[r.journal_id] } : r, ['id'])
    })()
  }))
}

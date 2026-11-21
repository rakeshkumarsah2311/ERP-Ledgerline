import crypto from 'crypto'
import { assertBalanced, monthlyDep, assetEntry, depEntry } from './accounting.js'

// Period control, fixed assets and recurring journals.
export function mountFinance(app, { db, auth, need, w, post, r2 }) {
  const FIN = ['admin', 'manager', 'accountant'], today = () => new Date().toISOString().slice(0, 10), thisMonth = () => today().slice(0, 7), name = id => (db.prepare('SELECT name FROM users WHERE id=?').get(id) || {}).name || ''
  const nextMonth = d => { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m, Math.min(day, 28))).toISOString().slice(0, 10) }
  const lastDay = p => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
  const okPeriod = p => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || ''))

  app.post('/api/periods/close', auth, need('admin', 'accountant'), w(({ uid, me, body: b }) => {
    if (!okPeriod(b.period)) throw new Error('Choose a month')
    if (b.period >= thisMonth()) throw new Error('A period can be closed only after it has ended')
    if (db.prepare("SELECT 1 FROM docs WHERE user_id=? AND type='invoice' AND status='pending' AND substr(date,1,7)=?").get(uid, b.period)) throw new Error('Approve or reject the pending invoices dated in this period first')
    db.prepare("INSERT INTO periods(id,user_id,period,status,closed_by,closed_at,note) VALUES(?,?,?,'closed',?,?,?) ON CONFLICT(user_id,period) DO UPDATE SET status='closed',closed_by=excluded.closed_by,closed_at=excluded.closed_at,note=excluded.note").run(crypto.randomUUID().slice(0, 8), uid, b.period, name(me), new Date().toISOString(), b.note || '')
  }))
  app.post('/api/periods/reopen', auth, need('admin'), w(({ uid, me, body: b }) => {
    if (!okPeriod(b.period)) throw new Error('Choose a month')
    if (String(b.reason || '').trim().length < 5) throw new Error('Give a reason for reopening (at least 5 characters)')
    db.prepare("UPDATE periods SET status='open', note=? WHERE user_id=? AND period=?").run(`Reopened by ${name(me)}: ${b.reason.trim()}`, uid, b.period)
  }))

  app.post('/api/assets', auth, need(...FIN), w(({ uid, body: b }) => {
    const cost = r2(Number(b.cost)), salvage = r2(Number(b.salvage) || 0), life = Number(b.life_years)
    if (!String(b.name || '').trim()) throw new Error('Enter the asset name')
    if (!(cost > 0) || salvage < 0 || salvage >= cost) throw new Error('Cost must be above zero and the salvage value below the cost')
    if (!(life > 0 && life <= 50)) throw new Error('Enter the useful life in years')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.purchase_date || '')) throw new Error('Enter the purchase date')
    db.transaction(() => {
      const id = crypto.randomUUID().slice(0, 8)
      db.prepare("INSERT INTO assets(id,user_id,name,category,purchase_date,cost,salvage,life_years,acc_dep,status) VALUES(?,?,?,?,?,?,?,?,0,'active')").run(id, uid, b.name.trim(), b.category || '', b.purchase_date, cost, salvage, life)
      post(uid, { date: b.purchase_date, ref: `ASSET ${b.name.trim()}`, memo: 'Fixed asset purchase', source: 'asset', source_id: id, lines: assetEntry(cost, b.paid_from) })
    })()
  }))
  // One depreciation run per asset per month; the unique (asset, period) key prevents double posting.
  app.post('/api/assets/depreciate', auth, need(...FIN), w(({ uid, body: b }) => {
    if (!okPeriod(b.period) || b.period > thisMonth()) throw new Error('Choose a month that has started')
    let total = 0, n = 0
    db.transaction(() => {
      for (const a of db.prepare("SELECT * FROM assets WHERE user_id=? AND status='active' AND substr(purchase_date,1,7)<=?").all(uid, b.period)) {
        if (db.prepare('SELECT 1 FROM asset_dep WHERE asset_id=? AND period=?').get(a.id, b.period)) continue
        const amt = monthlyDep(a); if (amt <= 0) continue
        db.prepare('INSERT INTO asset_dep(asset_id,period,amount) VALUES(?,?,?)').run(a.id, b.period, amt); db.prepare('UPDATE assets SET acc_dep=? WHERE id=?').run(r2(a.acc_dep + amt), a.id); total += amt; n++
      }
      total = r2(total); if (total > 0) post(uid, { date: lastDay(b.period), ref: `DEP ${b.period}`, memo: 'Monthly depreciation', source: 'depreciation', source_id: `${b.period}:${crypto.randomUUID().slice(0, 4)}`, lines: depEntry(total) })
    })()
    return { assets: n, amount: total }
  }))

  app.post('/api/recurring', auth, need(...FIN), w(({ uid, body: b }) => {
    const lines = (b.lines || []).map(l => ({ account: String(l.account), debit: r2(Number(l.debit) || 0), credit: r2(Number(l.credit) || 0) })).filter(l => l.debit || l.credit)
    lines.forEach(l => { if (!db.prepare('SELECT 1 FROM accounts WHERE user_id=? AND code=?').get(uid, l.account)) throw new Error(`Unknown account ${l.account}`) })
    assertBalanced(lines)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.next_date || '')) throw new Error('Enter the first posting date')
    db.prepare("INSERT INTO recurring(id,user_id,memo,frequency,next_date,lines,active) VALUES(?,?,?,'monthly',?,?,1)").run(crypto.randomUUID().slice(0, 8), uid, b.memo || 'Recurring entry', b.next_date, JSON.stringify(lines))
  }))
  app.post('/api/recurring/:id/toggle', auth, need(...FIN), w(({ uid, params }) => { db.prepare('UPDATE recurring SET active=1-active WHERE id=? AND user_id=?').run(params.id, uid) }))
  app.delete('/api/recurring/:id', auth, need(...FIN), w(({ uid, params }) => { db.prepare('DELETE FROM recurring WHERE id=? AND user_id=?').run(params.id, uid) }))
  // Posts every due occurrence once (source_id = rule + date). A closed period stops the run so nothing is silently skipped.
  const runRecurring = uid => {
    let n = 0
    db.transaction(() => {
      for (const r of db.prepare('SELECT * FROM recurring WHERE user_id=? AND active=1 AND next_date<=?').all(uid, today())) {
        let d = r.next_date, guard = 0
        while (d <= today() && guard++ < 12) {
          if (!db.prepare("SELECT 1 FROM journal WHERE user_id=? AND source='recurring' AND source_id=?").get(uid, `${r.id}:${d}`)) { post(uid, { date: d, ref: 'Recurring', memo: r.memo, source: 'recurring', source_id: `${r.id}:${d}`, lines: JSON.parse(r.lines) }); n++ }
          d = nextMonth(d)
        }
        db.prepare('UPDATE recurring SET next_date=? WHERE id=?').run(d, r.id)
      }
    })()
    return n
  }
  app.post('/api/recurring/run', auth, need(...FIN), w(({ uid }) => ({ posted: runRecurring(uid) })))
  return { runRecurring }
}

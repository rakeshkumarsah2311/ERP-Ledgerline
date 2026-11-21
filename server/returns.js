import crypto from 'crypto'
import { returnTotals, creditNoteEntry } from './accounting.js'

// Sales returns and credit notes. A credit note reduces the invoice's receivable, reverses sales and GST, and can put goods back into stock.
export function mountReturns(app, { db, auth, need, w, post, adj, defWh, r2, paidSum, docTotal }) {
  app.post('/api/returns', auth, need('admin', 'manager', 'accountant'), w(({ uid, body: b }) => {
    const inv = db.prepare("SELECT * FROM docs WHERE id=? AND user_id=? AND type='invoice' AND status='approved'").get(b.invoice_id, uid)
    if (!inv) throw new Error('Choose an approved invoice')
    const items = db.prepare('SELECT * FROM doc_items WHERE doc_id=?').all(inv.id)
    const prior = db.prepare('SELECT ci.code, SUM(ci.qty) q FROM credit_items ci JOIN credit_notes n ON n.id=ci.note_id WHERE n.invoice_id=? AND n.user_id=? GROUP BY ci.code').all(inv.id, uid)
    const lines = (b.lines || []).map(l => ({ code: String(l.code), qty: Number(l.qty) })).filter(l => l.qty > 0)
    if (!lines.length) throw new Error('Enter a quantity to return')
    for (const l of lines) {
      const it = items.find(i => i.code === l.code); if (!it) throw new Error(`${l.code} is not on this invoice`)
      const left = it.qty - ((prior.find(p => p.code === l.code) || {}).q || 0); if (l.qty > left + 1e-9) throw new Error(`Only ${left} of ${it.name} can still be returned`)
    }
    const date = b.date || new Date().toISOString().slice(0, 10)
    if (date < inv.date) throw new Error('A credit note cannot be dated before its invoice')
    const t = returnTotals(inv, items, lines), id = crypto.randomUUID().slice(0, 8), restock = b.restock ? 1 : 0
    let no = ''
    db.transaction(() => {
      no = 'CN-' + (1001 + db.prepare('SELECT COUNT(*) c FROM credit_notes WHERE user_id=?').get(uid).c)
      db.prepare('INSERT INTO credit_notes(id,user_id,no,date,invoice_id,cust,reason,restock,taxable,tax,total,warehouse) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, uid, no, date, inv.id, inv.cust, b.reason || '', restock, t.taxable, t.tax, t.total, inv.warehouse || '')
      const ins = db.prepare('INSERT INTO credit_items(note_id,code,name,uom,qty,price,rate,hsn,taxable) VALUES(?,?,?,?,?,?,?,?,?)')
      let cogs = 0; const wh = inv.warehouse || defWh(uid)
      t.lines.forEach((l, k) => {
        ins.run(id, l.code, l.name, l.uom, l.qty, l.price, l.rate, l.hsn, l.taxable)
        const p = db.prepare('SELECT * FROM products WHERE code=? AND user_id=?').get(l.code, uid)
        if (restock && p && p.manage) {
          cogs += (p.cost || 0) * l.qty; adj(uid, p.id, wh, l.qty, 'return', no)
          db.prepare('INSERT INTO lots(id,user_id,lot_no,product_id,qty,received,note,warehouse_id,expiry,remaining) VALUES(?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID().slice(0, 8), uid, `RET-${no}-${k + 1}`, p.id, l.qty, date, `Returned against ${no}`, wh, '', l.qty)
        }
      })
      post(uid, { date, ref: `CN ${no}`, memo: b.reason || 'Sales return', source: 'creditnote', source_id: id, lines: creditNoteEntry(t, r2(cogs)) })
      db.prepare("INSERT INTO payments(id,user_id,kind,doc_id,party,amount,date,mode,ref) VALUES(?,?,'credit',?,?,?,?,'credit',?)").run(crypto.randomUUID().slice(0, 8), uid, inv.id, inv.cust, t.total, date, no)
      if (paidSum(inv.id) >= docTotal(uid, inv.id) - 0.005) db.prepare('UPDATE docs SET paid=1 WHERE id=?').run(inv.id)
    })()
    return { id, no, total: t.total }
  }))
}

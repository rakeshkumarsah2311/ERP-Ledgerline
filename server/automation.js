import crypto from 'crypto'

export const DEFAULT_RULES = [
  ['low_stock', 'Stock below minimum: create reorder suggestion', 0, 'inapp'], ['invoice_overdue', 'Invoice overdue: send payment reminder (days after due date)', 7, 'whatsapp'],
  ['po_over_limit', 'Purchase order above limit: request approval', 0, 'inapp'], ['credit_block', 'Customer over credit limit: block invoice', 0, 'inapp'],
  ['expiry_near', 'Lot nearing expiry: notify warehouse manager (days ahead)', 30, 'inapp'], ['expense_over_budget', 'Expense over budget: notify finance manager', 0, 'inapp'],
  ['lead_unassigned', 'New lead: assign a sales executive', 0, 'inapp'], ['month_end', 'Month-end approaching: notify accountant (days before)', 3, 'inapp'],
  ['approval_pending', 'Approval waiting too long: escalate to admin (days)', 2, 'inapp']]
export const POLICIES = ['po_over_limit', 'credit_block']  // enforced inside the posting code; the switch here turns them on or off
export const ensureRules = (db, uid) => {
  const has = db.prepare('SELECT kind FROM automation_rules WHERE user_id=?').all(uid).map(r => r.kind)
  DEFAULT_RULES.filter(r => !has.includes(r[0])).forEach(([kind, name, param, channel]) => db.prepare('INSERT INTO automation_rules(id,user_id,kind,name,enabled,channel,param) VALUES(?,?,?,?,1,?,?)').run(`${uid}-${kind}`, uid, kind, name, channel, param))
}

const ago = (d, t) => Math.floor((new Date(t + 'T00:00:00Z') - new Date(d + 'T00:00:00Z')) / 864e5)
const fmt = n => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Turns the current business data into findings. Pure: the caller decides what to do with them.
export function evaluate(rule, S, today) {
  const out = [], p = Number(rule.param) || 0, cd = Number(S.company.credit_days) || 30, week = Math.floor(new Date(today).getTime() / 6048e5), month = today.slice(0, 7), cust = id => S.customers.find(c => c.id === id) || {}
  switch (rule.kind) {
    case 'low_stock': S.products.filter(x => x.manage && x.qty <= (+x.reorder || 10)).forEach(x => {
      const lv = +x.reorder || 10, want = Math.max(0, (+x.max_level > 0 ? +x.max_level : lv * 3) - x.qty)
      out.push({ key: `low:${x.id}`, role: 'manager', title: `Reorder suggestion: ${x.name}`, detail: `${x.qty} in stock (minimum ${lv}). Suggested order quantity: ${want}.` }) }); break
    case 'invoice_overdue': S.docs.filter(d => d.type === 'invoice' && d.status === 'approved' && !d.paid).forEach(d => {
      const bal = (d.total || 0) - (d.paid_amt || 0), late = ago(d.date, today) - cd
      if (bal > 0.005 && late > p) { const c = cust(d.cust), msg = `Hello ${c.name}, a reminder from ${S.company.name}: invoice ${d.no} for ${fmt(bal)} is ${late} days past its due date. Please arrange payment. Thank you.`
        out.push({ key: `ovd:${d.id}:${week}`, role: 'accountant', title: `Payment reminder: invoice ${d.no} (${c.name})`, detail: `${fmt(bal)} overdue by ${late} days`, channel: rule.channel, to: rule.channel === 'email' ? c.email : c.phone, subject: `Payment reminder: invoice ${d.no}`, message: msg }) } }); break
    case 'expiry_near': S.lots.filter(l => l.expiry && l.remaining > 0).forEach(l => {
      const left = -ago(l.expiry, today); if (left <= (p || 30)) out.push({ key: `exp:${l.id}`, role: 'manager', title: left < 0 ? `Lot ${l.lot_no} has expired` : `Lot ${l.lot_no} expires in ${left} day(s)`, detail: `${l.remaining} units remaining` }) }); break
    case 'expense_over_budget': S.budgets.filter(b => b.period === month && !b.centre).forEach(b => {
      const act = S.expenses.filter(e => e.date.startsWith(month) && e.account === b.account).reduce((a, e) => a + e.amount, 0)
      if (act > b.amount) out.push({ key: `bud:${month}:${b.account}`, role: 'accountant', title: `Over budget: ${(S.accounts.find(a => a.code === b.account) || {}).name || b.account}`, detail: `Spent ${fmt(act)} against a budget of ${fmt(b.amount)} for ${month}` }) }); break
    case 'lead_unassigned': {
      const staff = (S.team || []).filter(u => u.role === 'staff'), n = Object.fromEntries(staff.map(u => [u.name, S.leads.filter(l => l.owner === u.name).length]))
      S.leads.filter(l => !l.owner && !['Won', 'Lost'].includes(l.stage)).forEach(l => {
        if (!staff.length) return out.push({ key: `lead:${l.id}`, role: 'manager', title: `New lead needs an owner: ${l.name}`, detail: 'No sales executive exists yet. Add a Staff user in Team & roles.' })
        const o = [...staff].sort((a, b) => n[a.name] - n[b.name])[0]; n[o.name]++
        out.push({ key: `lead:${l.id}`, role: 'staff', title: `Lead assigned: ${l.name} → ${o.name}`, detail: l.company || '', assign: { lead_id: l.id, owner: o.name } }) }) } break
    case 'month_end': { const d = new Date(today + 'T00:00:00Z'), last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(), left = last - d.getUTCDate()
      if (left <= (p || 3)) out.push({ key: `me:${month}`, role: 'accountant', title: `Month-end in ${left} day(s)`, detail: 'Post depreciation and recurring journals, reconcile the bank, then run the closing checks.' }) } break
    case 'approval_pending': {
      S.docs.filter(d => d.type === 'invoice' && d.status === 'pending' && ago(d.date, today) > (p || 2)).forEach(d => out.push({ key: `esc:${d.id}`, role: 'admin', title: `Escalation: invoice ${d.no} is waiting for approval`, detail: `${ago(d.date, today)} days since it was created` }))
      S.pos.filter(o => o.status === 'awaiting_approval' && ago(o.date, today) > (p || 2)).forEach(o => out.push({ key: `esc:${o.id}`, role: 'admin', title: `Escalation: purchase order ${o.no} is waiting for approval`, detail: `${ago(o.date, today)} days since it was created` })) } break
  }
  return out
}

const wa = (ph, msg) => { let d = String(ph || '').replace(/\D/g, ''); if (d.length === 10) d = '91' + d; return d ? `https://wa.me/${d}?text=${encodeURIComponent(msg)}` : '' }

export function mountAutomation(app, { db, auth, need, w, aw, all, runRecurring }) {
  const today = () => new Date().toISOString().slice(0, 10), log = (uid, rule, status, detail) => db.prepare('INSERT INTO automation_runs(user_id,rule_id,name,status,detail) VALUES(?,?,?,?,?)').run(uid, rule.id, rule.name, status, String(detail).slice(0, 300))
  // Policies (credit block, PO approval) are enforced where the records are posted; they are skipped here.
  const run = (uid, manual) => {
    ensureRules(db, uid); let created = 0
    const S = all(uid, 'admin'), rules = db.prepare('SELECT * FROM automation_rules WHERE user_id=? AND enabled=1').all(uid)
    for (const r of rules) {
      if (POLICIES.includes(r.kind)) continue
      try {
        let n = 0
        for (const f of evaluate(r, S, today())) {
          if (f.assign) db.prepare('UPDATE leads SET owner=? WHERE id=? AND user_id=?').run(f.assign.owner, f.assign.lead_id, uid)
          const link = f.channel === 'whatsapp' ? wa(f.to, f.message) : ''
          const ins = db.prepare('INSERT OR IGNORE INTO tasks(id,user_id,dedupe,kind,title,detail,role,status,channel,link) VALUES(?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID().slice(0, 8), uid, f.key, r.kind, f.title, f.detail || '', f.role || 'admin', 'open', f.channel || 'inapp', link)
          if (!ins.changes) continue
          n++
          if (f.channel === 'email') db.prepare('INSERT INTO outbox(id,user_id,channel,recipient,subject,body,status,error) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID().slice(0, 8), uid, 'email', f.to || '', f.subject || f.title, f.message || f.detail, f.to ? 'queued' : 'failed', f.to ? '' : 'No email address on file')
        }
        created += n; if (n || manual) log(uid, r, 'ok', `${n} new item(s)`)
      } catch (e) { log(uid, r, 'failed', e.message) }
    }
    try { const n = runRecurring(uid); if (n) log(uid, { id: 'recurring', name: 'Recurring journal entries' }, 'ok', `${n} entr${n > 1 ? 'ies' : 'y'} posted`) } catch (e) { log(uid, { id: 'recurring', name: 'Recurring journal entries' }, 'failed', e.message) }
    return created
  }
  async function deliver() {
    for (const o of db.prepare("SELECT * FROM outbox WHERE status='queued' LIMIT 20").all()) {
      try {
        if (!process.env.SMTP_HOST) throw new Error('Email is not configured: set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM')
        const nm = await import('nodemailer').catch(() => null); if (!nm) throw new Error('Install the optional nodemailer package to send email')
        const port = Number(process.env.SMTP_PORT) || 587, t = nm.default.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
        await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: o.recipient, subject: o.subject, text: o.body })
        db.prepare("UPDATE outbox SET status='sent' WHERE id=?").run(o.id)
      } catch (e) { db.prepare("UPDATE outbox SET status='failed', error=? WHERE id=?").run(String(e.message).slice(0, 200), o.id) }
    }
  }
  app.post('/api/automation/run', auth, need('admin', 'manager', 'accountant'), aw(async ({ uid }) => { const created = run(uid, true); await deliver(); return { created } }))
  app.put('/api/automation/rules/:id', auth, need('admin'), w(({ uid, body: b, params }) => {
    if (!['inapp', 'whatsapp', 'email'].includes(b.channel)) throw new Error('Choose a channel')
    db.prepare('UPDATE automation_rules SET enabled=?, channel=?, param=? WHERE id=? AND user_id=?').run(b.enabled ? 1 : 0, b.channel, Math.max(0, Number(b.param) || 0), params.id, uid)
  }))
  app.post('/api/tasks/:id/done', auth, need('admin', 'manager', 'accountant', 'staff'), w(({ uid, params }) => { db.prepare("UPDATE tasks SET status='done' WHERE id=? AND user_id=?").run(params.id, uid) }))
  // Background schedule: every 15 minutes for every business.
  const tick = () => { for (const { user_id } of db.prepare('SELECT user_id FROM company').all()) { try { run(user_id, false) } catch (e) { console.error('automation', e.message) } } deliver().catch(() => {}) }
  setTimeout(tick, 5000).unref(); setInterval(tick, 15 * 60 * 1000).unref()
}

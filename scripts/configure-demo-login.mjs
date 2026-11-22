import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const email = String(process.env.DEMO_EMAIL || '').trim().toLowerCase()
const password = String(process.env.DEMO_PASSWORD || '')
if (!email || !password) process.exit(0)
if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('DEMO_EMAIL must be a valid email address.')
if (password.length < 6) throw new Error('DEMO_PASSWORD must be at least 6 characters.')

const dbPath = process.env.LEDGERLINE_DB || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'ledgerline.db')
if (!fs.existsSync(dbPath)) process.exit(0) // A new database will be seeded with these credentials.
const db = new Database(dbPath, { timeout: 5000 })
try {
  const target = db.prepare('SELECT id FROM users WHERE email=?').get(email)
  if (target) {
    db.prepare('UPDATE users SET hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), target.id)
    console.log('Updated the local demo account password.')
  } else {
    const demo = db.prepare("SELECT id FROM users WHERE email='admin@ledgerline.test' AND role='admin'").get()
    if (!demo) process.exit(0)
    db.prepare('UPDATE users SET email=?, hash=? WHERE id=?').run(email, bcrypt.hashSync(password, 10), demo.id)
    console.log('Updated the local demo account email and password.')
  }
} finally {
  db.close()
}

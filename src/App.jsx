import { useState, useEffect } from 'react'
import { api, tok } from './api'
import Auth from './Auth.jsx'
import { notifications } from './analytics'
import { setCurrency, inr } from './utils'
import { Icon, Skeleton } from './ui'
import Executive from './Executive.jsx'
import { Company, Reports } from './Pages.jsx'
import { Customers, Drivers, Products, Lots } from './Master.jsx'
import { DocList, Editor, Viewer } from './Docs.jsx'
import Warehouses from './Warehouses.jsx'
import Forecast from './Forecast.jsx'
import Insights from './Insights.jsx'
import { Approvals, Team } from './Team.jsx'
import { Suppliers, POList, POEditor, POView } from './Purchases.jsx'
import Returns from './Returns.jsx'
import Finance from './Finance.jsx'
import CRM from './CRM.jsx'
import Security from './Security.jsx'
import Command from './Command.jsx'
import Planning from './Planning.jsx'
import Automation from './Automation.jsx'
import SalesReturns from './SalesReturns.jsx'

const ALL = ['admin', 'manager', 'accountant', 'staff', 'viewer', 'ceo'], MGR = ['admin', 'manager'], FIN = ['admin', 'manager', 'accountant'], FINC = [...FIN, 'ceo']
// [page, label, icon, roles allowed]
const MENU = [
  ['Overview', [['command', 'Command Centre', 'target', ['admin', 'ceo']], ['dash', 'Dashboard', 'dash', ALL], ['insights', 'Analytics', 'bars', ALL], ['forecast', 'AI forecasting', 'spark', ALL]]],
  ['Sales & CRM', [['crm', 'CRM & pipeline', 'target', ['admin', 'manager', 'staff']], ['customers', 'Customers', 'users', ALL], ['quotations', 'Quotations', 'quote', ALL], ['invoices', 'Invoices', 'file', ALL], ['salesreturns', 'Sales returns', 'quote', FIN]]],
  ['Inventory', [['products', 'Products', 'box', ALL], ['lots', 'Lots & batches', 'layers', ALL], ['warehouses', 'Warehouses & counts', 'wh', ALL], ['drivers', 'Drivers', 'truck', ALL]]],
  ['Purchasing', [['suppliers', 'Suppliers', 'users', FIN], ['pos', 'Purchase orders', 'cart', FIN]]],
  ['Finance', [['finance', 'Accounting', 'book', FINC], ['planning', 'Financial intelligence', 'spark', FINC], ['returns', 'GST & e-invoicing', 'gst', FIN]]],
  ['Administration', [['approvals', 'Approvals', 'check', MGR], ['team', 'Team & roles', 'users', ['admin']], ['automation', 'Automation centre', 'cog', FIN], ['security', 'Security & audit', 'shield', MGR], ['company', 'Company settings', 'cog', ['admin']]]],
]
const savedUser = () => { try { return tok.get() ? JSON.parse(localStorage.getItem('ll_user')) : null } catch (e) { return null } }
const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch (e) { return d } }

export default function App() {
  const [user, setUser] = useState(savedUser), [S, setS] = useState(null), [pg, setPg] = useState({ n: 'dash' }), [msg, setMsg] = useState(''), [open, setOpen] = useState(false)
  const [pal, setPal] = useState(false), [pq, setPq] = useState(''), [psel, setPsel] = useState(0), [theme, setTheme] = useState(() => ls('ll_theme', 'dark')), [col, setCol] = useState(() => ls('ll_col', false)), [bell, setBell] = useState(false), [read, setRead] = useState(() => ls('ll_read', [])), [q, setQ] = useState('')
  const toast = m => { setMsg(m); setTimeout(() => setMsg(''), 3400) }
  const load = () => api('/all').then(setS).catch(e => toast(e.message))
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('ll_theme', JSON.stringify(theme)) } catch (e) {} }, [theme])
  useEffect(() => { try { localStorage.setItem('ll_col', JSON.stringify(col)); localStorage.setItem('ll_read', JSON.stringify(read)) } catch (e) {} }, [col, read])
  useEffect(() => { if (user) load() }, [user])
  useEffect(() => { const k = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal(true) } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])

  // Screens work with plain lists; this writes every change to the database.
  const set = async (k, v) => {
    const old = S[k]; setS(s => ({ ...s, [k]: v }))
    try {
      if (k === 'company') await api('/company', 'PUT', v)
      else {
        const prev = new Map(old.map(r => [r.id, r]))
        for (const r of v) {
          if (!prev.has(r.id)) await api(`/${k}`, 'POST', r)
          else if (JSON.stringify(prev.get(r.id)) !== JSON.stringify(r)) await api(`/${k}/${r.id}`, 'PUT', r)
        }
        for (const r of old) if (!v.some(x => x.id === r.id)) await api(`/${k}/${r.id}`, 'DELETE')
        if (['lots', 'docs', 'warehouses', 'products', 'accounts', 'leads'].includes(k)) load()
      }
    } catch (e) { toast(e.message); load() }
  }
  const go = (n, x = {}) => { setPg({ n, ...x }); setOpen(false); setBell(false); setQ(''); window.scrollTo(0, 0) }
  const view = id => setPg({ n: 'view', id })
  const logout = () => { tok.clear(); setUser(null); setS(null); setPg({ n: 'dash' }) }

  if (!user) return <Auth onAuth={(u, t) => { tok.set(t); localStorage.setItem('ll_user', JSON.stringify(u)); setUser(u) }} />
  if (!S) return <Skeleton />
  setCurrency(S.company.currency)
  const role = user.role || 'admin', P = { S, set, toast, go, view, role, reload: load, user }, doc = S.docs.find(d => d.id === pg.id)
  const notes = notifications(S), unread = notes.filter(n => !read.includes(n.id)), pending = S.docs.filter(d => d.type === 'invoice' && d.status === 'pending').length + S.pos.filter(p => p.status === 'awaiting_approval').length
  const pages = {
    dash: <Executive {...P} />, company: <Company {...P} />, customers: <Customers {...P} />, products: <Products {...P} />, lots: <Lots {...P} />, warehouses: <Warehouses {...P} />, drivers: <Drivers {...P} />,
    invoices: <DocList type="invoice" {...P} />, quotations: <DocList type="quotation" {...P} />, 'new-invoice': <Editor type="invoice" {...P} done={() => go('invoices')} />, 'new-quotation': <Editor type="quotation" {...P} done={() => go('quotations')} />,
    view: doc && <Viewer d={doc} {...P} back={() => go(doc.type === 'invoice' ? 'invoices' : 'quotations')} />,
    forecast: <Forecast {...P} />, insights: <Insights {...P} />, rc: <Reports kind="c" S={S} />, ri: <Reports kind="i" S={S} />, approvals: <Approvals {...P} />, team: <Team {...P} />,
    suppliers: <Suppliers {...P} />, pos: <POList {...P} />, 'po-new': <POEditor {...P} prefill={pg.items} />, 'po-view': <POView {...P} id={pg.id} />, returns: <Returns {...P} />, finance: <Finance {...P} />, crm: <CRM {...P} />, security: <Security {...P} />, command: <Command {...P} />, planning: <Planning {...P} />, automation: <Automation {...P} />, salesreturns: <SalesReturns {...P} pre={pg.invoice} />,
  }
  const label = (MENU.flatMap(g => g[1]).find(i => i[0] === pg.n) || [0, { view: 'Document', 'new-invoice': 'New invoice', 'new-quotation': 'New quotation', 'po-new': 'New purchase order', 'po-view': 'Purchase order' }[pg.n] || 'Reports'])[1]
  const find = qs => (qs.trim().length < 2 ? [] : [
    ...S.docs.filter(d => (d.no + ((S.customers.find(c => c.id === d.cust) || {}).name || '')).toLowerCase().includes(qs.toLowerCase())).slice(0, 5).map(d => ({ t: `${d.type === 'invoice' ? 'Invoice' : 'Quotation'} ${d.no}`, s: inr(d.total || 0), f: () => view(d.id) })),
    ...S.customers.filter(c => c.name.toLowerCase().includes(qs.toLowerCase())).slice(0, 4).map(c => ({ t: c.name, s: 'Customer', f: () => go('customers') })),
    ...S.products.filter(p => (p.name + p.code + p.barcode).toLowerCase().includes(qs.toLowerCase())).slice(0, 4).map(p => ({ t: p.name, s: `Product ${p.code}`, f: () => go('products') }))])
  const hits = find(q)
  const pitems = pal ? [...MENU.flatMap(g => g[1]).filter(m => m[3].includes(role) && m[1].toLowerCase().includes(pq.toLowerCase())).map(m => ({ t: m[1], s: 'Go to page', f: () => go(m[0]) })).slice(0, 8), ...find(pq)] : []
  return (
    <div className={'app' + (col ? ' collapsed' : '')}>
      <aside className={'side' + (open ? ' open' : '')}><div className="brand"><i>L</i><span>Ledgerline</span></div>
        {MENU.map(([g, items]) => { const vis = items.filter(i => i[3].includes(role)); return vis.length > 0 && <div key={g}><div className="grp">{g}</div>{vis.map(([k, l, ic]) => <button key={k} title={l} className={'nav' + (pg.n === k ? ' on' : '')} onClick={() => go(k)}><Icon n={ic} /><span>{l}</span>{k === 'approvals' && pending > 0 && <b>{pending}</b>}</button>)}</div> })}
        <div style={{ marginTop: 'auto', paddingTop: 12 }}><button className="nav" onClick={logout} title="Logout"><Icon n="out" /><span>Logout</span></button></div></aside>
      <div className="main"><div className="top"><div className="row" style={{ flexWrap: 'nowrap' }}>
        <button className="tool" aria-label="Toggle menu" onClick={() => (window.innerWidth < 860 ? setOpen(!open) : setCol(!col))}><Icon n="menu" /></button><h2>{label}</h2></div>
        <div className="search"><input placeholder="Search invoices, customers, products" value={q} onChange={e => setQ(e.target.value)} />{hits.length > 0 && <div className="drop">{hits.map((h, i) => <div key={i} onClick={h.f}>{h.t} <small>{h.s}</small></div>)}</div>}</div>
        <div className="row" style={{ flexWrap: 'nowrap', position: 'relative' }}>
          <button className="tool" aria-label="Command palette (Ctrl+K)" title="Ctrl+K" onClick={() => setPal(true)}><Icon n="search" /></button>
          <button className="tool" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon n={theme === 'dark' ? 'sun' : 'moon'} /></button>
          <button className="tool" aria-label="Notifications" onClick={() => setBell(!bell)}><Icon n="bell" />{unread.length > 0 && <b>{unread.length}</b>}</button>
          {bell && <div className="drop notif"><div className="row sp" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}><b>Notifications</b><button className="btn ghost sm" onClick={() => setRead(notes.map(n => n.id))}>Mark all read</button></div>
            {notes.map((n, i) => <div key={i} style={{ opacity: read.includes(n.id) ? .55 : 1 }} onClick={() => setRead([...new Set([...read, n.id])])}><span className={'pill ' + (n.k === 'bad' ? 'o' : 'p')}>{n.k === 'bad' ? 'Urgent' : 'Review'}</span> {n.t}</div>)}{!notes.length && <div className="empty">You are all caught up.</div>}</div>}
          <span className="pill q" title={user.email}>{user.name} · {role}</span></div></div>
        {pages[pg.n] || pages.dash}</div>
      {pal && <div className="mod" onClick={() => setPal(false)}><div onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <input autoFocus placeholder="Jump to a page or find a record (Esc to close)" value={pq} onChange={e => { setPq(e.target.value); setPsel(0) }} onKeyDown={e => {
          if (e.key === 'Escape') setPal(false)
          if (e.key === 'ArrowDown') { e.preventDefault(); setPsel(Math.min(pitems.length - 1, psel + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setPsel(Math.max(0, psel - 1)) }
          if (e.key === 'Enter' && pitems[psel]) { pitems[psel].f(); setPal(false); setPq('') } }} />
        <div style={{ marginTop: 10 }}>{pitems.map((h, i) => <div key={i} style={{ padding: '9px 12px', borderRadius: 8, cursor: 'pointer', background: i === psel ? 'var(--card2)' : 'transparent' }} onClick={() => { h.f(); setPal(false); setPq('') }}>{h.t} <small style={{ color: 'var(--mut)' }}>{h.s}</small></div>)}{!pitems.length && <div className="empty">No matches.</div>}</div></div></div>}
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { api } from './api'
import { DataTable } from './ui'
import { downloadJson } from './utils'

export default function Security({ role, toast, reload }) {
  const [tab, setTab] = useState('audit'), [log, setLog] = useState(null), [q, setQ] = useState('')
  useEffect(() => { api('/audit').then(setLog).catch(e => toast(e.message)) }, [])
  const restore = e => {
    const file = e.target.files[0]; if (!file) return
    if (!confirm('Restoring replaces ALL current business data with the backup. Continue?')) return
    const r = new FileReader()
    r.onload = async () => { try { await api('/restore', 'POST', JSON.parse(r.result)); toast('Backup restored'); await reload() } catch (x) { toast(x.message) } }
    r.readAsText(file)
  }
  const rows = (log || []).filter(l => JSON.stringify(l).toLowerCase().includes(q.toLowerCase()))
  const cols = [{ h: 'When', f: l => String(l.at).slice(0, 19).replace('T', ' ') }, { h: 'User', f: l => l.actor }, { h: 'Role', f: l => <span className="pill q">{l.role}</span> }, { h: 'Action', f: l => l.action }, { h: 'Record', f: l => `${l.entity} ${l.entity_id}` }, { h: 'IP', f: l => l.ip }]
  return (
    <div className="page"><h1>Security & audit</h1><p className="lead">Who did what and when, sign-in history, and your data backup.</p>
      <div className="tabbar">{[['audit', 'Activity log'], ['login', 'Login history'], ...(role === 'admin' ? [['data', 'Backup & restore']] : [])].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab !== 'data' && <div className="card"><input placeholder="Search by user, action or record" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 340, marginBottom: 12 }} />
        {log ? <DataTable size={15} rows={tab === 'login' ? rows.filter(l => l.action === 'login') : rows.filter(l => l.action !== 'login')} cols={cols} empty="No activity recorded yet." /> : <div className="skel" style={{ height: 200 }} />}</div>}
      {tab === 'data' && <div className="card"><h3>Backup & restore</h3><p className="lead">Download a full copy of your company data as a file, and restore it later if needed. Keep backups somewhere safe: they contain customer and financial records.</p>
        <p className="row"><button className="btn acc" onClick={async () => { try { downloadJson(`ledgerline-backup-${new Date().toISOString().slice(0, 10)}.json`, await api('/backup')); toast('Backup downloaded') } catch (e) { toast(e.message) } }}>Download backup</button>
          <label className="btn ghost" style={{ margin: 0, cursor: 'pointer' }}>Restore from file<input type="file" accept=".json,application/json" hidden onChange={restore} /></label></p></div>}
    </div>
  )
}

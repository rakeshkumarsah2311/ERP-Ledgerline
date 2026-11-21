import { useState } from 'react'
import { api } from './api'
import { inr, fd, calc } from './utils'
import { Field } from './ui'

export function Approvals({ S, reload, toast, view, role, go }) {
  const pend = S.docs.filter(d => d.type === 'invoice' && d.status === 'pending'), pos = S.pos.filter(p => p.status === 'awaiting_approval'), cn = id => (S.customers.find(c => c.id === id) || {}).name
  const act = async (path, ok) => { try { await api(path, 'POST'); toast(ok); reload() } catch (e) { toast(e.message) } }
  return (
    <div className="page"><h1>Approvals</h1><p className="lead">Staff invoices and large purchase orders wait here. Stock and accounts update only after approval.</p>
      <div className="card"><h3>Invoices ({pend.length})</h3><div className="tw"><table><thead><tr><th>No.</th><th>Customer</th><th>Date</th><th className="n">Net total</th><th /></tr></thead>
        <tbody>{pend.map(d => <tr key={d.id}><td>{d.no}</td><td>{cn(d.cust)}</td><td>{fd(d.date)}</td><td className="n">{inr(calc(d).n)}</td>
          <td className="row"><button className="btn ghost sm" onClick={() => view(d.id)}>View</button><button className="btn acc sm" onClick={() => act(`/docs/${d.id}/approve`, 'Invoice approved and booked')}>Approve</button><button className="btn bad sm" onClick={() => act(`/docs/${d.id}/reject`, 'Invoice rejected')}>Reject</button></td></tr>)}</tbody></table>
        {!pend.length && <div className="empty">No invoices are waiting.</div>}</div></div>
      <div className="card"><h3>Purchase orders ({pos.length})</h3><div className="tw"><table><thead><tr><th>PO</th><th>Supplier</th><th className="n">Total</th><th /></tr></thead>
        <tbody>{pos.map(p => <tr key={p.id}><td>{p.no}</td><td>{(S.suppliers.find(x => x.id === p.supplier) || {}).name}</td><td className="n">{inr(p.total)}</td>
          <td className="row"><button className="btn ghost sm" onClick={() => go('po-view', { id: p.id })}>View</button>{role === 'admin' ? <><button className="btn acc sm" onClick={() => act(`/pos/${p.id}/approve`, 'Purchase order approved')}>Approve</button><button className="btn bad sm" onClick={() => act(`/pos/${p.id}/reject`, 'Returned to draft')}>Reject</button></> : <span className="pill p">Admin approval needed</span>}</td></tr>)}</tbody></table>
        {!pos.length && <div className="empty">No purchase orders are waiting.</div>}</div></div></div>
  )
}

const ROLES = [['manager', 'Manager: full access and approvals'], ['accountant', 'Accountant: finance, GST and payments'], ['ceo', 'CEO: read-only executive access'], ['staff', 'Staff: creates invoices (need approval) and customers'], ['viewer', 'Viewer: read-only']]
export function Team({ S, reload, toast }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'staff' }), u = k => e => setF({ ...f, [k]: e.target.value })
  const add = async () => { try { await api('/team', 'POST', f); toast('Team member added'); setF({ name: '', email: '', password: '', role: 'staff' }); reload() } catch (e) { toast(e.message) } }
  const del = async m => { if (!confirm(`Remove ${m.name}?`)) return; try { await api('/team/' + m.id, 'DELETE'); toast('Member removed'); reload() } catch (e) { toast(e.message) } }
  return (
    <div className="page"><h1>Team & roles</h1><p className="lead">Give each person only the access they need. You are the Admin.</p>
      <div className="card"><h3>Add team member</h3><div className="grid">
        <Field l="Full name"><input value={f.name} onChange={u('name')} /></Field><Field l="Email"><input type="email" value={f.email} onChange={u('email')} /></Field>
        <Field l="Password"><input type="password" value={f.password} onChange={u('password')} /></Field>
        <Field l="Role"><select value={f.role} onChange={u('role')}>{ROLES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select></Field></div>
        <p><button className="btn acc" onClick={add}>Add member</button></p></div>
      <div className="card"><h3>Members</h3><div className="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
        <tbody>{S.team.map(m => <tr key={m.id}><td>{m.name}</td><td>{m.email}</td><td><span className="pill q">{m.role}</span></td><td><button className="btn bad sm" onClick={() => del(m)}>Remove</button></td></tr>)}</tbody></table>
        {!S.team.length && <div className="empty">No team members yet.</div>}</div></div></div>
  )
}

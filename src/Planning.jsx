import { useState } from 'react'
import { api } from './api'
import { inr, fd, today, uid, fyStart, calc } from './utils'
import { Field, DataTable, Kpi } from './ui'
import { Crud } from './Master.jsx'
import { liveInvoices } from './analytics'
import { pl, bs } from './fin'
import { cashForecast, creditRisk, ratios, budgetVariance, closingChecks } from './intel'

const TABS = [['bud', 'Budgets'], ['cash', 'Cash flow'], ['risk', 'Credit risk'], ['rat', 'Ratios'], ['cen', 'Cost & profit centres'], ['fa', 'Fixed assets'], ['rec', 'Recurring journals'], ['close', 'Period closing']]
export default function Planning(p) {
  const [tab, setTab] = useState('bud')
  return (
    <div className="page"><h1>Financial intelligence</h1><p className="lead">Budgets, cash forecast, risk, ratios, assets and month-end control.</p>
      <div className="tabbar noprint">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'bud' && <Budgets {...p} />}{tab === 'cash' && <Cash {...p} />}{tab === 'risk' && <Risk {...p} />}{tab === 'rat' && <Ratios {...p} />}{tab === 'cen' && <Centres {...p} />}{tab === 'fa' && <Assets {...p} />}{tab === 'rec' && <Recurring {...p} />}{tab === 'close' && <Closing {...p} />}
    </div>
  )
}

const nm = (p, i) => { const [y, m] = p.split('-').map(Number), d = new Date(y, m - 1 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function Budgets({ S, set, toast }) {
  const [month, setMonth] = useState(today().slice(0, 7)), [centre, setCentre] = useState(''), accts = S.accounts.filter(a => a.type === 'expense' && a.code !== '5000')
  const bud = c => S.budgets.find(b => b.period === month && b.account === c && (b.centre || '') === centre), rows = budgetVariance(S, month, centre)
  const save = (c, v) => {
    const ex = bud(c), amt = +v || 0; if ((ex && ex.amount === amt) || (!ex && !amt)) return
    set('budgets', ex && !amt ? S.budgets.filter(b => b.id !== ex.id) : ex ? S.budgets.map(b => (b.id === ex.id ? { ...b, amount: amt } : b)) : [...S.budgets, { id: uid(), period: month, account: c, centre, amount: amt }])
  }
  const repeat = () => {
    const add = []; S.budgets.filter(b => b.period === month && (b.centre || '') === centre).forEach(b => { for (let i = 1; i <= 11; i++) if (!S.budgets.some(x => x.period === nm(month, i) && x.account === b.account && (x.centre || '') === centre)) add.push({ ...b, id: uid(), period: nm(month, i) }) })
    if (!add.length) return toast('Nothing to copy'); set('budgets', [...S.budgets, ...add]); toast(`Copied to the next 11 months (${add.length} lines)`)
  }
  return <div className="card"><div className="row sp"><h3>Budget versus actual</h3><div className="row"><input type="month" style={{ width: 160 }} value={month} onChange={e => setMonth(e.target.value)} />
    <select style={{ width: 200 }} value={centre} onChange={e => setCentre(e.target.value)}><option value="">Whole company</option>{S.centres.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn ghost sm" onClick={repeat}>Repeat for 11 months</button></div></div>
    <div className="tw"><table><thead><tr><th>Expense head</th><th className="n">Budget</th><th className="n">Actual</th><th className="n">Variance</th><th>Used</th></tr></thead><tbody>
      {accts.map(a => { const r = rows.find(x => x.account === a.code); return <tr key={a.code + month + centre}><td>{a.name}</td><td className="n"><input type="number" min="0" style={{ width: 120 }} defaultValue={bud(a.code)?.amount || ''} onBlur={e => save(a.code, e.target.value)} /></td>
        <td className="n">{r ? inr(r.actual) : '–'}</td><td className={'n ' + (r && r.over ? 'down' : '')}>{r ? inr(r.variance) : '–'}</td><td>{r ? <span className={'pill ' + (r.over ? 'o' : r.pct > 85 ? 'p' : 'd')}>{r.pct}%</span> : ''}</td></tr> })}</tbody></table></div>
    <small style={{ color: 'var(--mut)' }}>Actuals come from the ledger{centre ? ' (expenses tagged to this centre)' : ''}. Budgets save when you leave a field.</small></div>
}
function Cash({ S }) {
  const f = cashForecast(S, today()), worst = Math.min(...f.rows.map(r => r.projected))
  return <><div className="kpis"><Kpi l="Cash and bank today" v={inr(f.cash)} /><Kpi l="Monthly running costs" v={inr(f.opex)} sub="3-month average" /><Kpi l="Overdue receivables" v={inr(f.overdueRecv)} /><Kpi l="Overdue supplier bills" v={inr(f.overduePay)} /></div>
    <div className="card"><h3>30, 60 and 90 day forecast {worst < 0 ? <span className="pill o">Cash shortfall</span> : <span className="pill d">Positive</span>}</h3>
      <DataTable rows={f.rows.map(r => ({ id: r.days, ...r }))} cols={[{ h: 'Horizon', f: r => `${r.days} days`, nosort: 1 }, { h: 'Opening cash', n: 1, f: () => inr(f.cash), nosort: 1 }, { h: '+ Receipts due', n: 1, f: r => inr(r.rec), nosort: 1 }, { h: '− Supplier bills due', n: 1, f: r => inr(r.pay), nosort: 1 }, { h: '− Running costs', n: 1, f: r => inr(r.opex), nosort: 1 }, { h: 'Projected cash', n: 1, nosort: 1, f: r => <b className={r.projected < 0 ? 'down' : ''}>{inr(r.projected)}</b> }]} />
      <small style={{ color: 'var(--mut)' }}>Method: receivables and supplier bills fall due on invoice date plus the terms in Company settings; overdue items count as due now; running costs are the average of the last 3 months. It does not include future sales or purchases that have not been recorded.</small></div></>
}
function Risk({ S }) {
  const rows = creditRisk(S, today())
  return <div className="card"><h3>Customer credit risk</h3><DataTable rows={rows} empty="No customers with balances or payment history yet." cols={[{ h: 'Customer', f: r => r.name }, { h: 'Outstanding', n: 1, f: r => inr(r.open), v: r => r.open }, { h: 'Overdue', n: 1, f: r => inr(r.overdue), v: r => r.overdue }, { h: 'Avg days late', n: 1, f: r => r.avgLate },
    { h: 'Risk', f: r => <span className={'pill ' + (r.risk === 'High' ? 'o' : r.risk === 'Medium' ? 'p' : 'd')}>{r.risk}</span>, v: r => r.score }, { h: 'Why', nosort: 1, f: r => r.reasons.join('; ') || '–' }]} />
    <small style={{ color: 'var(--mut)' }}>Score = share of balance overdue (up to 50) + average days paid late (up to 30) + credit-limit use (up to 20). High is 60 or more, Medium 30 or more.</small></div>
}
function Ratios({ S }) {
  const r = ratios(S, today(), fyStart(S.company)), f = (v, d = 2, s = '') => (v === null ? 'n/a' : v.toFixed(d) + s)
  const C = [['Current ratio', f(r.currentRatio), 'Current assets ÷ current liabilities'], ['Quick ratio', f(r.quickRatio), '(Cash + receivables) ÷ current liabilities'], ['Working capital', inr(r.workingCapital), 'Current assets − current liabilities'], ['Gross margin', f(r.grossMargin, 1, '%'), 'Gross profit ÷ revenue, financial year to date'],
    ['Net margin', f(r.netMargin, 1, '%'), 'Net profit ÷ revenue, financial year to date'], ['Receivable days (DSO)', f(r.dso, 0), 'Receivables ÷ revenue × days elapsed'], ['Payable days (DPO)', f(r.dpo, 0), 'Payables ÷ cost of goods × days elapsed'], ['Inventory turnover', f(r.turnover, 1, '×'), 'Cost of goods ÷ inventory, annualised'], ['Cash conversion cycle', f(r.ccc, 0, ' days'), 'DSO + inventory days − DPO']]
  return <div className="kpis">{C.map(([l, v, n]) => <div className="kpi" key={l}><label>{l}</label><b>{v}</b><small style={{ color: 'var(--mut)' }}>{n}</small></div>)}</div>
}
function Centres(p) {
  const { S } = p, from = fyStart(S.company), inv = liveInvoices(S).filter(d => d.date >= from)
  const rows = S.centres.map(c => ({ id: c.id, name: c.name, kind: c.kind, rev: inv.filter(d => d.centre === c.id).reduce((a, d) => a + calc(d).t, 0), spend: S.expenses.filter(e => e.centre === c.id && e.date >= from).reduce((a, e) => a + e.amount, 0) }))
  return <><div style={{ margin: '-26px -28px 0' }}><Crud {...p} title="Cost & profit centres" lead="Tag invoices to a profit centre and expenses to a cost centre to see department performance." coll="centres" blank={{ name: '', kind: 'profit' }}
    valid={f => (!f.name.trim() ? 'Enter the centre name' : '')} fields={(f, s) => [<Field key="a" l="Name"><input value={f.name} onChange={e => s({ ...f, name: e.target.value })} /></Field>, <Field key="b" l="Type"><select value={f.kind} onChange={e => s({ ...f, kind: e.target.value })}><option value="profit">Profit centre</option><option value="cost">Cost centre</option></select></Field>]}
    cols={[['Centre', r => r.name], ['Type', r => <span className="pill q">{r.kind}</span>]]} /></div>
    <div className="card"><h3>Performance this financial year</h3><DataTable rows={rows} empty="No centres yet." cols={[{ h: 'Centre', f: r => r.name }, { h: 'Revenue', n: 1, f: r => inr(r.rev), v: r => r.rev }, { h: 'Expenses', n: 1, f: r => inr(r.spend), v: r => r.spend }]} /></div></>
}
function Assets({ S, toast, reload }) {
  const [f, setF] = useState({ name: '', category: '', purchase_date: today(), cost: '', salvage: 0, life_years: 5, paid_from: 'bank' }), [per, setPer] = useState(today().slice(0, 7)), u = k => e => setF({ ...f, [k]: e.target.value })
  const add = async () => { try { await api('/assets', 'POST', f); toast('Asset recorded'); setF({ ...f, name: '', cost: '' }); reload() } catch (e) { toast(e.message) } }
  const dep = async () => { try { const r = await api('/assets/depreciate', 'POST', { period: per }); toast(r.amount ? `Depreciation of ${inr(r.amount)} posted for ${r.assets} asset(s)` : 'Nothing to depreciate for this month'); reload() } catch (e) { toast(e.message) } }
  return <><div className="card"><h3>Add a fixed asset</h3><div className="grid"><Field l="Asset name"><input value={f.name} onChange={u('name')} /></Field><Field l="Category"><input value={f.category} onChange={u('category')} /></Field><Field l="Purchase date"><input type="date" value={f.purchase_date} onChange={u('purchase_date')} /></Field>
    <Field l="Cost"><input type="number" min="0" value={f.cost} onChange={u('cost')} /></Field><Field l="Salvage value"><input type="number" min="0" value={f.salvage} onChange={u('salvage')} /></Field><Field l="Useful life (years)"><input type="number" min="1" value={f.life_years} onChange={u('life_years')} /></Field>
    <Field l="Paid from"><select value={f.paid_from} onChange={u('paid_from')}><option value="bank">Bank</option><option value="cash">Cash</option><option value="payable">On credit (payable)</option></select></Field></div><p><button className="btn acc" onClick={add}>Add asset</button></p></div>
    <div className="card"><div className="row sp"><h3>Asset register</h3><div className="row"><input type="month" style={{ width: 160 }} value={per} onChange={e => setPer(e.target.value)} /><button className="btn acc sm" onClick={dep}>Post depreciation</button></div></div>
      <DataTable rows={S.assets} empty="No fixed assets yet." cols={[{ h: 'Asset', f: r => r.name }, { h: 'Category', f: r => r.category }, { h: 'Bought', f: r => fd(r.purchase_date), v: r => r.purchase_date }, { h: 'Cost', n: 1, f: r => inr(r.cost), v: r => r.cost }, { h: 'Accumulated', n: 1, f: r => inr(r.acc_dep), v: r => r.acc_dep }, { h: 'Book value', n: 1, f: r => inr(r.cost - r.acc_dep), v: r => r.cost - r.acc_dep }]} />
      <small style={{ color: 'var(--mut)' }}>Straight-line, charged from the month of purchase, never below salvage value. Each asset is depreciated once per month.</small></div></>
}
function Recurring({ S, toast, reload }) {
  const bl = () => ({ account: '', debit: '', credit: '' }), [f, setF] = useState({ memo: '', next_date: today(), lines: [bl(), bl()] }), up = (i, k, v) => setF({ ...f, lines: f.lines.map((l, x) => (x === i ? { ...l, [k]: v } : l)) })
  const call = async (fn, ok) => { try { const r = await fn(); toast(typeof ok === 'function' ? ok(r) : ok); reload() } catch (e) { toast(e.message) } }
  return <><div className="card"><h3>New recurring monthly entry (rent, loan interest, insurance)</h3><div className="grid"><Field l="Memo"><input value={f.memo} onChange={e => setF({ ...f, memo: e.target.value })} /></Field><Field l="First posting date"><input type="date" value={f.next_date} onChange={e => setF({ ...f, next_date: e.target.value })} /></Field></div>
    <div className="tw"><table><thead><tr><th>Account</th><th className="n">Debit</th><th className="n">Credit</th></tr></thead><tbody>{f.lines.map((l, i) => <tr key={i}><td><select value={l.account} onChange={e => up(i, 'account', e.target.value)}><option value="">Select account</option>{S.accounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></td>
      <td><input type="number" min="0" value={l.debit} onChange={e => up(i, 'debit', e.target.value)} /></td><td><input type="number" min="0" value={l.credit} onChange={e => up(i, 'credit', e.target.value)} /></td></tr>)}</tbody></table></div>
    <p className="row"><button className="btn ghost" onClick={() => setF({ ...f, lines: [...f.lines, bl()] })}>+ Add line</button><button className="btn acc" onClick={() => call(() => api('/recurring', 'POST', f), 'Recurring entry saved')}>Save</button></p></div>
    <div className="card"><div className="row sp"><h3>Scheduled entries</h3><button className="btn ghost sm" onClick={() => call(() => api('/recurring/run', 'POST'), r => `${r.posted} entr${r.posted === 1 ? 'y' : 'ies'} posted`)}>Post what is due now</button></div>
      <DataTable rows={S.recurring} empty="No recurring entries." cols={[{ h: 'Memo', f: r => r.memo }, { h: 'Next date', f: r => fd(r.next_date), v: r => r.next_date }, { h: 'Amount', n: 1, f: r => inr(r.lines.reduce((a, l) => a + l.debit, 0)) }, { h: 'Status', f: r => <span className={'pill ' + (r.active ? 'd' : 'q')}>{r.active ? 'Active' : 'Paused'}</span>, nosort: 1 },
        { h: '', nosort: 1, f: r => <div className="row"><button className="btn ghost sm" onClick={() => call(() => api(`/recurring/${r.id}/toggle`, 'POST'), 'Updated')}>{r.active ? 'Pause' : 'Resume'}</button><button className="btn bad sm" onClick={() => confirm('Delete this schedule? Entries already posted stay.') && call(() => api(`/recurring/${r.id}`, 'DELETE'), 'Deleted')}>Delete</button></div> }]} /></div></>
}
function Closing({ S, role, toast, reload, user }) {
  const prev = nm(today().slice(0, 7), -1), [per, setPer] = useState(prev), [rep, setRep] = useState(false), c = closingChecks(S, per), st = S.periods.find(x => x.period === per), closed = st && st.status === 'closed'
  const P = pl(S, per + '-01', per + '-31'), B = bs(S, per + '-31'), canClose = ['admin', 'accountant'].includes(role)
  const act = async (path, body, ok) => { try { await api(path, 'POST', body); toast(ok); reload() } catch (e) { toast(e.message) } }
  const ico = { ok: <span className="pill d">Pass</span>, warn: <span className="pill p">Review</span>, fail: <span className="pill o">Fail</span> }
  return <><div className="card noprint"><div className="row sp"><h3>Month-end closing {closed && <span className="pill d">Closed</span>}</h3><div className="row"><input type="month" style={{ width: 160 }} value={per} max={prev} onChange={e => { setPer(e.target.value); setRep(false) }} />
    <button className="btn ghost sm" onClick={() => setRep(!rep)}>{rep ? 'Hide' : 'Generate'} closing report</button>
    {canClose && !closed && <button className="btn acc sm" disabled={!c.canClose} onClick={() => confirm(`Close ${per}? Nothing can be posted into it until an admin reopens it.`) && act('/periods/close', { period: per }, 'Period closed')}>Close period</button>}
    {role === 'admin' && closed && <button className="btn bad sm" onClick={() => { const r = prompt('Reason for reopening ' + per); r && act('/periods/reopen', { period: per, reason: r }, 'Period reopened') }}>Reopen</button>}</div></div>
    {c.checks.map((x, i) => <div key={i} className="row sp" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}><span>{x.label}<br /><small style={{ color: 'var(--mut)' }}>{x.detail}</small></span>{ico[x.k]}</div>)}
    {st && st.note && <p className="lead">{st.note}</p>}</div>
    <div className="card noprint"><h3>Periods</h3><DataTable size={6} rows={S.periods.slice().sort((a, b) => b.period.localeCompare(a.period))} empty="No period has been closed yet." cols={[{ h: 'Period', f: r => r.period }, { h: 'Status', f: r => <span className={'pill ' + (r.status === 'closed' ? 'd' : 'p')}>{r.status}</span> }, { h: 'By', f: r => r.closed_by }, { h: 'Note', f: r => r.note }]} /></div>
    {rep && <div className="sheet"><div className="row sp"><h2>{S.company.name}</h2><div style={{ textAlign: 'right' }}><h1>Monthly closing report</h1><div>Period: <b>{per}</b></div><div>Generated: {fd(today())}</div></div></div>
      <h3 style={{ margin: '16px 0 6px' }}>Reconciliation checks</h3><table><tbody>{c.checks.map((x, i) => <tr key={i}><td>{x.label}</td><td>{x.detail}</td><td><b>{x.k === 'ok' ? 'Pass' : x.k === 'warn' ? 'Review' : 'Fail'}</b></td></tr>)}</tbody></table>
      <h3 style={{ margin: '16px 0 6px' }}>Profit and loss</h3><table><tbody><tr><td>Revenue</td><td className="n">{inr(P.totalIncome)}</td></tr><tr><td>Gross profit</td><td className="n">{inr(P.grossProfit)}</td></tr><tr><td>Total expenses</td><td className="n">{inr(P.totalExpense)}</td></tr><tr><td><b>Net profit</b></td><td className="n"><b>{inr(P.profit)}</b></td></tr></tbody></table>
      <h3 style={{ margin: '16px 0 6px' }}>Position at month end</h3><table><tbody><tr><td>Total assets</td><td className="n">{inr(B.ta)}</td></tr><tr><td>Total liabilities</td><td className="n">{inr(B.tl)}</td></tr><tr><td>Equity incl. earnings</td><td className="n">{inr(B.te)}</td></tr></tbody></table>
      <div className="two" style={{ marginTop: 40 }}><div>Prepared by: {user.name}<div style={{ borderTop: '1px solid #999', marginTop: 28 }}>Signature / date</div></div><div>Approved by:<div style={{ borderTop: '1px solid #999', marginTop: 44 }}>Signature / date</div></div></div>
      <button className="btn noprint" onClick={() => window.print()}>Print / save as PDF</button></div>}</>
}

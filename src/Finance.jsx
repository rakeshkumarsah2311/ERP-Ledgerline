import { useState } from 'react'
import { api } from './api'
import { inr, fd, ago, today, uid, fyStart, downloadCsv } from './utils'
import { Field, DataTable, Status } from './ui'
import { Crud } from './Master.jsx'
import PayModal from './Pay.jsx'
import { trial, pl, bs, unusualExpenses } from './fin'

const TABS = [['recv', 'Receivables'], ['pay', 'Payables'], ['exp', 'Expenses'], ['jrn', 'Journal'], ['gl', 'General ledger'], ['tb', 'Trial balance'], ['pl', 'Profit & loss'], ['bs', 'Balance sheet'], ['rec', 'Bank reconciliation'], ['coa', 'Chart of accounts']]
const acctName = (S, code) => (S.accounts.find(a => a.code === code) || {}).name || code

export default function Finance(p) {
  const [tab, setTab] = useState('recv')
  return (
    <div className="page"><h1>Accounting</h1><p className="lead">Double-entry books. Invoices, purchases, payments, expenses and stock counts post here automatically.</p>
      <div className="tabbar">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'recv' && <Open {...p} kind="receipt" />}{tab === 'pay' && <Open {...p} kind="payment" />}{tab === 'exp' && <Expenses {...p} />}{tab === 'jrn' && <Journal {...p} />}
      {tab === 'gl' && <Ledger {...p} />}{tab === 'tb' && <Trial {...p} />}{tab === 'pl' && <PL {...p} />}{tab === 'bs' && <BS {...p} />}{tab === 'rec' && <Recon {...p} />}
      {tab === 'coa' && <div style={{ margin: '-26px -28px' }}><Crud {...p} title="Chart of accounts" lead="Add your own income and expense heads." coll="accounts" blank={{ code: '', name: '', type: 'expense' }}
        valid={f => (!/^\d{4}$/.test(f.code) ? 'Account code must be 4 digits' : !f.name.trim() ? 'Enter the account name' : p.S.accounts.some(a => a.code === f.code && a.id !== f.id) ? 'This code already exists' : '')}
        fields={(f, s) => [<Field key="a" l="Code"><input value={f.code} maxLength={4} onChange={e => s({ ...f, code: e.target.value })} /></Field>, <Field key="b" l="Name"><input value={f.name} onChange={e => s({ ...f, name: e.target.value })} /></Field>,
          <Field key="c" l="Type"><select value={f.type} onChange={e => s({ ...f, type: e.target.value })}>{['asset', 'liability', 'equity', 'income', 'expense'].map(t => <option key={t}>{t}</option>)}</select></Field>]}
        cols={[['Code', r => r.code], ['Account', r => r.name], ['Type', r => <span className="pill q">{r.type}</span>]]} /></div>}
    </div>
  )
}

// Open invoices (receivables) or received purchase orders (payables) with payment recording and ageing.
function Open({ S, kind, toast, reload }) {
  const [pay, setPay] = useState(null), recv = kind === 'receipt'
  const party = id => (recv ? S.customers : S.suppliers).find(x => x.id === id) || {}
  const rows = (recv ? S.docs.filter(d => d.type === 'invoice' && d.status === 'approved') : S.pos.filter(x => x.status === 'received')).map(d => ({ ...d, bal: Math.round(((d.total || 0) - (d.paid_amt || 0)) * 100) / 100, who: party(recv ? d.cust : d.supplier).name })).filter(d => d.bal > 0.005)
  const tot = rows.reduce((a, r) => a + r.bal, 0), bucket = r => { const a = ago(r.date); return a <= 30 ? 0 : a <= 60 ? 1 : a <= 90 ? 2 : 3 }
  const ageing = [0, 1, 2, 3].map(i => rows.filter(r => bucket(r) === i).reduce((a, r) => a + r.bal, 0))
  return (<>
    <div className="kpis">{['0–30 days', '31–60 days', '61–90 days', '90+ days'].map((l, i) => <div className="kpi" key={l}><label>{l}</label><b>{inr(ageing[i])}</b></div>)}</div>
    <div className="card"><h3>{recv ? 'Outstanding customer invoices' : 'Outstanding supplier bills'}: {inr(tot)}</h3>
      <DataTable rows={rows} empty={recv ? 'No outstanding invoices.' : 'No unpaid supplier bills.'} cols={[
        { h: 'No.', f: r => r.no }, { h: recv ? 'Customer' : 'Supplier', f: r => r.who }, { h: 'Date', f: r => fd(r.date), v: r => r.date }, { h: 'Age (days)', n: 1, f: r => ago(r.date) },
        { h: 'Total', n: 1, f: r => inr(r.total), v: r => r.total }, { h: 'Paid', n: 1, f: r => inr(r.paid_amt), v: r => r.paid_amt }, { h: 'Balance', n: 1, f: r => <b>{inr(r.bal)}</b>, v: r => r.bal },
        { h: '', nosort: 1, f: r => <button className="btn acc sm" onClick={() => setPay(r)}>{recv ? 'Receive' : 'Pay'}</button> }]} /></div>
    {pay && <PayModal kind={kind} doc={pay} onClose={() => setPay(null)} toast={toast} reload={reload} />}</>)
}

function Expenses({ S, toast, reload }) {
  const accts = S.accounts.filter(a => a.type === 'expense' && a.code !== '5000'), [f, setF] = useState({ date: today(), account: '6040', payee: '', amount: '', gst: 0, mode: 'bank', note: '', centre: '' }), flagged = unusualExpenses(S.expenses)
  const save = async () => { try { await api('/expenses', 'POST', f); toast('Expense recorded'); setF({ ...f, payee: '', amount: '', gst: 0, note: '' }); reload() } catch (e) { toast(e.message) } }
  return (<>
    <div className="card"><h3>Record an expense</h3><div className="grid">
      <Field l="Date"><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
      <Field l="Expense head"><select value={f.account} onChange={e => setF({ ...f, account: e.target.value })}>{accts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</select></Field>
      <Field l="Paid to"><input value={f.payee} onChange={e => setF({ ...f, payee: e.target.value })} /></Field>
      <Field l="Amount (before GST)"><input type="number" min="0" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
      <Field l="GST paid (claimable)"><input type="number" min="0" value={f.gst} onChange={e => setF({ ...f, gst: e.target.value })} /></Field>
      <Field l="Paid from"><select value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}><option value="bank">Bank account</option><option value="cash">Cash in hand</option></select></Field>
      <Field l="Cost centre (optional)"><select value={f.centre} onChange={e => setF({ ...f, centre: e.target.value })}><option value="">None</option>{S.centres.filter(c => c.kind === 'cost').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field l="Note"><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field></div><p><button className="btn acc" onClick={save}>Record expense</button></p></div>
    <div className="card"><h3>Expenses</h3><DataTable rows={S.expenses.slice().reverse()} empty="No expenses recorded yet." cols={[
      { h: 'Date', f: r => fd(r.date), v: r => r.date }, { h: 'Head', f: r => acctName(S, r.account) }, { h: 'Paid to', f: r => r.payee }, { h: 'Amount', n: 1, f: r => inr(r.amount), v: r => r.amount }, { h: 'GST', n: 1, f: r => inr(r.gst), v: r => r.gst },
      { h: 'Mode', f: r => r.mode }, { h: 'Flag', nosort: 1, f: r => (flagged.has(r.id) ? <span className="pill o">Unusual</span> : '') }]} /></div></>)
}

function Journal({ S, toast, reload }) {
  const blank = () => ({ account: '', debit: '', credit: '' }), [f, setF] = useState({ date: today(), ref: '', memo: '', lines: [blank(), blank()] })
  const dr = f.lines.reduce((a, l) => a + (+l.debit || 0), 0), cr = f.lines.reduce((a, l) => a + (+l.credit || 0), 0), diff = Math.round((dr - cr) * 100) / 100
  const up = (i, k, v) => setF({ ...f, lines: f.lines.map((l, x) => (x === i ? { ...l, [k]: v } : l)) })
  const save = async () => { try { await api('/journal', 'POST', f); toast('Journal posted'); setF({ date: today(), ref: '', memo: '', lines: [blank(), blank()] }); reload() } catch (e) { toast(e.message) } }
  const groups = Object.values(S.ledger.reduce((m, l) => { const g = m[l.journal_id] || (m[l.journal_id] = { id: l.journal_id, date: l.date, ref: l.ref, memo: l.memo, source: l.source, amt: 0 }); g.amt += l.debit; return m }, {})).reverse()
  return (<>
    <div className="card"><h3>New journal entry (opening balances, corrections)</h3><div className="grid"><Field l="Date"><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field><Field l="Reference"><input value={f.ref} onChange={e => setF({ ...f, ref: e.target.value })} /></Field><Field l="Memo"><input value={f.memo} onChange={e => setF({ ...f, memo: e.target.value })} /></Field></div>
      <div className="tw"><table><thead><tr><th>Account</th><th className="n">Debit</th><th className="n">Credit</th><th /></tr></thead><tbody>{f.lines.map((l, i) => <tr key={i}>
        <td><select value={l.account} onChange={e => up(i, 'account', e.target.value)}><option value="">Select account</option>{S.accounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></td>
        <td><input type="number" min="0" value={l.debit} onChange={e => up(i, 'debit', e.target.value)} /></td><td><input type="number" min="0" value={l.credit} onChange={e => up(i, 'credit', e.target.value)} /></td>
        <td><button className="btn bad sm" onClick={() => f.lines.length > 2 && setF({ ...f, lines: f.lines.filter((_, x) => x !== i) })}>×</button></td></tr>)}</tbody>
        <tfoot><tr><td>Totals {diff !== 0 && <span className="pill o">Out of balance by {inr(Math.abs(diff))}</span>}</td><td className="n">{inr(dr)}</td><td className="n">{inr(cr)}</td><td /></tr></tfoot></table></div>
      <p className="row"><button className="btn ghost" onClick={() => setF({ ...f, lines: [...f.lines, blank()] })}>+ Add line</button><button className="btn acc" disabled={diff !== 0 || !dr} onClick={save}>Post journal</button></p></div>
    <div className="card"><h3>Journal entries</h3><DataTable rows={groups} cols={[{ h: 'Date', f: r => fd(r.date), v: r => r.date }, { h: 'Reference', f: r => r.ref }, { h: 'Memo', f: r => r.memo }, { h: 'Source', f: r => <span className="pill q">{r.source}</span>, v: r => r.source }, { h: 'Amount', n: 1, f: r => inr(r.amt), v: r => r.amt }]} /></div></>)
}

function Ledger({ S }) {
  const [a, setA] = useState('1000'), t = (S.accounts.find(x => x.code === a) || {}).type, sg = t === 'asset' || t === 'expense' ? 1 : -1; let run = 0
  const rows = S.ledger.filter(l => l.account === a).map(l => ({ ...l, bal: (run += sg * (l.debit - l.credit)) }))
  return <div className="card"><div className="row sp"><h3>General ledger</h3><select style={{ maxWidth: 280 }} value={a} onChange={e => setA(e.target.value)}>{S.accounts.map(x => <option key={x.code} value={x.code}>{x.code} {x.name}</option>)}</select></div>
    <DataTable size={15} rows={rows} cols={[{ h: 'Date', f: r => fd(r.date), v: r => r.date }, { h: 'Reference', f: r => r.ref }, { h: 'Memo', f: r => r.memo }, { h: 'Debit', n: 1, f: r => (r.debit ? inr(r.debit) : ''), v: r => r.debit }, { h: 'Credit', n: 1, f: r => (r.credit ? inr(r.credit) : ''), v: r => r.credit }, { h: 'Balance', n: 1, f: r => inr(r.bal), v: r => r.bal }]} /></div>
}
function Trial({ S }) {
  const [to, setTo] = useState(today()), rows = trial(S, to), dr = rows.reduce((a, r) => a + r.dr, 0), cr = rows.reduce((a, r) => a + r.cr, 0), ok = Math.abs(dr - cr) < 0.01
  return <div className="card"><div className="row sp"><h3>Trial balance {ok ? <span className="pill d">Balanced</span> : <span className="pill o">Out of balance</span>}</h3><div className="row"><input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 160 }} /><button className="btn ghost sm" onClick={() => downloadCsv('trial-balance.csv', [['Code', 'Account', 'Debit', 'Credit'], ...rows.map(r => [r.code, r.name, r.dr, r.cr])])}>Export Excel (CSV)</button></div></div>
    <DataTable size={30} rows={rows} cols={[{ h: 'Code', f: r => r.code }, { h: 'Account', f: r => r.name }, { h: 'Debit', n: 1, f: r => (r.dr ? inr(r.dr) : ''), v: r => r.dr }, { h: 'Credit', n: 1, f: r => (r.cr ? inr(r.cr) : ''), v: r => r.cr }]} foot={<tr><td /><td>Total</td><td className="n">{inr(dr)}</td><td className="n">{inr(cr)}</td></tr>} /></div>
}
const Block = ({ t, rows, total }) => <><tr><td colSpan="2"><b>{t}</b></td></tr>{rows.map(r => <tr key={r.code + r.name}><td>{r.name}</td><td className="n">{inr(r.amt)}</td></tr>)}<tr><td><b>Total {t.toLowerCase()}</b></td><td className="n"><b>{inr(total)}</b></td></tr></>
function PL({ S }) {
  const [r, setR] = useState({ from: fyStart(S.company), to: today() }), p = pl(S, r.from, r.to)
  return <div className="card"><div className="row sp"><h3>Profit & loss</h3><div className="row"><input type="date" style={{ width: 150 }} value={r.from} onChange={e => setR({ ...r, from: e.target.value })} /><input type="date" style={{ width: 150 }} value={r.to} onChange={e => setR({ ...r, to: e.target.value })} /><button className="btn ghost sm" onClick={() => window.print()}>Download PDF</button>
    <button className="btn ghost sm" onClick={() => downloadCsv('profit-loss.csv', [['Head', 'Amount'], ...p.income.map(x => [x.name, x.amt]), ['Total income', p.totalIncome], ...p.expense.map(x => [x.name, x.amt]), ['Total expenses', p.totalExpense], ['Net profit', p.profit]])}>Excel (CSV)</button></div></div>
    <div className="tw"><table><tbody><Block t="Income" rows={p.income} total={p.totalIncome} /><Block t="Expenses" rows={p.expense} total={p.totalExpense} /></tbody>
      <tfoot><tr><td>Gross profit</td><td className="n">{inr(p.grossProfit)}</td></tr><tr><td>Net {p.profit >= 0 ? 'profit' : 'loss'}</td><td className="n">{inr(p.profit)}</td></tr></tfoot></table></div></div>
}
function BS({ S }) {
  const [to, setTo] = useState(today()), b = bs(S, to)
  return <div className="card"><div className="row sp"><h3>Balance sheet {b.balanced ? <span className="pill d">Balanced</span> : <span className="pill o">Check entries</span>}</h3><div className="row"><input type="date" style={{ width: 160 }} value={to} onChange={e => setTo(e.target.value)} /><button className="btn ghost sm" onClick={() => window.print()}>Download PDF</button></div></div>
    <div className="cols2"><div className="tw"><table><tbody><Block t="Assets" rows={b.assets} total={b.ta} /></tbody></table></div><div className="tw"><table><tbody><Block t="Liabilities" rows={b.liabilities} total={b.tl} /><Block t="Equity" rows={b.equity} total={b.te} /></tbody></table></div></div></div>
}

// Tick the lines that appear on the bank statement; the difference should reach zero.
function Recon({ S, toast, reload }) {
  const [a, setA] = useState('1010'), [stmt, setStmt] = useState(''), rows = S.ledger.filter(l => l.account === a)
  const book = rows.reduce((x, l) => x + l.debit - l.credit, 0), cleared = rows.filter(l => l.cleared).reduce((x, l) => x + l.debit - l.credit, 0), diff = Math.round(((+stmt || 0) - cleared) * 100) / 100
  const toggle = async l => { try { await api('/ledger/clear', 'POST', { ids: [l.id], cleared: !l.cleared }); await reload() } catch (e) { toast(e.message) } }
  return <div className="card"><div className="row sp"><h3>Bank reconciliation</h3><select style={{ maxWidth: 240 }} value={a} onChange={e => setA(e.target.value)}><option value="1010">Bank Account</option><option value="1000">Cash in Hand</option></select></div>
    <div className="kpis"><div className="kpi"><label>Book balance</label><b>{inr(book)}</b></div><div className="kpi"><label>Cleared balance</label><b>{inr(cleared)}</b></div><div className="kpi"><label>Statement closing balance</label><input type="number" value={stmt} onChange={e => setStmt(e.target.value)} /></div>
      <div className="kpi"><label>Difference</label><b className={diff === 0 && stmt !== '' ? 'up' : 'down'}>{inr(diff)}</b></div></div>
    <DataTable size={15} rows={rows.slice().reverse()} cols={[{ h: 'Cleared', nosort: 1, f: l => <input type="checkbox" checked={!!l.cleared} onChange={() => toggle(l)} /> }, { h: 'Date', f: l => fd(l.date), v: l => l.date }, { h: 'Reference', f: l => l.ref }, { h: 'Deposit', n: 1, f: l => (l.debit ? inr(l.debit) : '') }, { h: 'Withdrawal', n: 1, f: l => (l.credit ? inr(l.credit) : '') }]} /></div>
}

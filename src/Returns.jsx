import { useState } from 'react'
import { api } from './api'
import { liveInvoices } from './analytics'
import { inr, today, fd, GSTIN, downloadJson } from './utils'

const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100
const add = (o, k, x) => { const t = o[k] || (o[k] = {}); Object.entries(x).forEach(([a, b]) => { t[a] = typeof b === 'number' && a !== 'rt' ? (t[a] || 0) + b : b }); return t }

export default function Returns({ S, toast, reload }) {
  const [per, setPer] = useState(today().slice(0, 7)), [busy, setBusy] = useState(''), co = S.company, mmyyyy = per.slice(5) + per.slice(0, 4)
  const cu = id => S.customers.find(c => c.id === id) || {}, state = g => (g || co.gst || '').slice(0, 2), sandbox = S.gst_mode !== 'live'
  const inv = liveInvoices(S).filter(d => d.date.startsWith(per)).sort((a, b) => String(a.no).localeCompare(String(b.no), undefined, { numeric: true }))
  const b2b = {}, b2cs = {}, hsn = {}, tot = { txval: 0, iamt: 0, camt: 0, samt: 0 }
  inv.forEach(d => {
    const u = cu(d.cust), reg = GSTIN.test(u.gst || ''), intra = state(u.gst) === state(co.gst), gross = d.items.reduce((a, i) => a + i.price * i.qty, 0), disc = Math.min(+d.discount || 0, gross), byRate = {}
    d.items.forEach(i => {
      const tx = gross ? i.price * i.qty * (1 - disc / gross) : 0, rt = i.rate ?? 18, tax = (tx * rt) / 100, sp = { txval: tx, iamt: intra ? 0 : tax, camt: intra ? tax / 2 : 0, samt: intra ? tax / 2 : 0 }
      add(byRate, rt, { rt, ...sp }); Object.keys(sp).forEach(k => { tot[k] += sp[k] })
      add(hsn, `${i.hsn || 'NA'}|${i.uom}|${rt}`, { hsn_sc: i.hsn || 'NA', uqc: i.uom, rt, qty: i.qty, val: tx + tax, ...sp })
      if (!reg) add(b2cs, `${intra ? 'INTRA' : 'INTER'}|${state(u.gst)}|${rt}`, { sply_ty: intra ? 'INTRA' : 'INTER', pos: state(u.gst), rt, ...sp })
    })
    if (reg) (b2b[u.gst] ||= []).push({ inum: d.no, idt: d.date.split('-').reverse().join('-'), val: r2(Object.values(byRate).reduce((a, x) => a + x.txval + x.iamt + x.camt + x.samt, 0)), pos: state(u.gst), rchrg: 'N', inv_typ: 'R',
      itms: Object.values(byRate).map((x, k) => ({ num: k + 1, itm_det: { rt: x.rt, txval: r2(x.txval), iamt: r2(x.iamt), camt: r2(x.camt), samt: r2(x.samt), csamt: 0 } })) })
  })
  // Credit notes reduce the period's outward supply. Registered customers go to CDNR; others reduce the B2C totals.
  const cdnr = {}
  ;(S.credit_notes || []).filter(n => n.date.startsWith(per)).forEach(n => {
    const u = cu(n.cust), reg = GSTIN.test(u.gst || ''), intra = state(u.gst) === state(co.gst), byRate = {}
    n.items.forEach(i => {
      const tx = i.taxable, tax = (tx * i.rate) / 100, sp = { txval: -tx, iamt: intra ? 0 : -tax, camt: intra ? -tax / 2 : 0, samt: intra ? -tax / 2 : 0 }
      add(byRate, i.rate, { rt: i.rate, ...sp }); Object.keys(sp).forEach(k => { tot[k] += sp[k] })
      add(hsn, `${i.hsn || 'NA'}|${i.uom}|${i.rate}`, { hsn_sc: i.hsn || 'NA', uqc: i.uom, rt: i.rate, qty: -i.qty, val: -(tx + tax), ...sp })
      if (!reg) add(b2cs, `${intra ? 'INTRA' : 'INTER'}|${state(u.gst)}|${i.rate}`, { sply_ty: intra ? 'INTRA' : 'INTER', pos: state(u.gst), rt: i.rate, ...sp })
    })
    if (reg) (cdnr[u.gst] || (cdnr[u.gst] = [])).push({ ntty: 'C', nt_num: n.no, nt_dt: n.date.split('-').reverse().join('-'), val: r2(n.total), pos: state(u.gst), rchrg: 'N', inv_typ: 'R', itms: Object.values(byRate).map((x, k) => ({ num: k + 1, itm_det: { rt: x.rt, txval: r2(-x.txval), iamt: r2(-x.iamt), camt: r2(-x.camt), samt: r2(-x.samt), csamt: 0 } })) })
  })
  const fix = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v]))
  const gstr1 = { gstin: co.gst, fp: mmyyyy, b2b: Object.entries(b2b).map(([ctin, i]) => ({ ctin, inv: i })), cdnr: Object.entries(cdnr).map(([ctin, nt]) => ({ ctin, nt })), b2cs: Object.values(b2cs).map(x => ({ ...fix(x), typ: 'OE', csamt: 0 })),
    hsn: { data: Object.values(hsn).map((x, k) => ({ num: k + 1, ...fix(x), desc: '', csamt: 0 })) },
    doc_issue: { doc_det: inv.length ? [{ doc_num: 1, doc_typ: 'Invoices for outward supply', docs: [{ num: 1, from: inv[0].no, to: inv[inv.length - 1].no, totnum: inv.length, cancel: 0, net_issue: inv.length }] }] : [] } }
  // Input tax credit from purchase orders already received from GST-registered suppliers.
  const itc = { iamt: 0, camt: 0, samt: 0 }
  S.pos.filter(p => p.status === 'received' && p.date.startsWith(per)).forEach(p => {
    const sup = S.suppliers.find(s => s.id === p.supplier) || {}; if (!GSTIN.test(sup.gstin || '')) return
    const intra = state(sup.gstin) === state(co.gst)
    p.items.forEach(i => { const tax = (i.qty * i.price * (i.rate ?? 18)) / 100; if (intra) { itc.camt += tax / 2; itc.samt += tax / 2 } else itc.iamt += tax })
  })
  const gstr3b = { gstin: co.gst, ret_period: mmyyyy, sup_details: { osup_det: { txval: r2(tot.txval), iamt: r2(tot.iamt), camt: r2(tot.camt), samt: r2(tot.samt), csamt: 0 } }, itc_elg: { itc_avl: [{ ty: 'OTH', iamt: r2(itc.iamt), camt: r2(itc.camt), samt: r2(itc.samt), csamt: 0 }] } }
  const out = tot.iamt + tot.camt + tot.samt, inn = itc.iamt + itc.camt + itc.samt
  const file = async (kind, payload) => {
    if (!GSTIN.test(co.gst || '')) return toast('Add a valid company GSTIN first')
    setBusy(kind); try { await api('/gst/filing', 'POST', { kind, period: per, payload }); toast(`${kind} sent`); await reload() } catch (e) { toast(e.message) } setBusy('')
  }
  const K = (l, v, s) => <div className="card" style={{ marginBottom: 0 }}><label>{l}</label><div style={{ font: '700 24px "Bricolage Grotesque"', color: 'var(--teal)' }}>{v}</div><small style={{ color: 'var(--mut)' }}>{s}</small></div>
  return (
    <div className="page"><div className="row sp"><div><h1>GST returns</h1><p className="lead">GSTR-1 and GSTR-3B prepared from your approved invoices and received purchases.</p></div><div><label>Return period</label><input type="month" value={per} onChange={e => setPer(e.target.value)} /></div></div>
      <div className="stats">{K('Taxable outward value', inr(tot.txval), `${inv.length} invoices`)}{K('Output tax', inr(out), 'CGST + SGST + IGST')}{K('Input tax credit', inr(inn), 'From received purchase orders')}{K('Net tax payable', inr(Math.max(0, out - inn)), out - inn < 0 ? `Credit carried forward ${inr(inn - out)}` : 'Before interest or late fee')}</div>
      <div className="card"><div className="row sp"><h3>GSTR-1: outward supplies</h3><div className="row">
        <button className="btn ghost sm" onClick={() => downloadJson(`GSTR1_${mmyyyy}.json`, gstr1)}>Download JSON</button>
        <button className="btn acc sm" disabled={!!busy || !inv.length} onClick={() => file('GSTR1', gstr1)}>{busy === 'GSTR1' ? 'Sending…' : 'Submit via GSP'}</button></div></div>
        <div className="tw"><table><thead><tr><th>Section</th><th className="n">Records</th><th className="n">Taxable value</th><th className="n">Tax</th></tr></thead><tbody>
          <tr><td>B2B (registered customers)</td><td className="n">{gstr1.b2b.reduce((a, x) => a + x.inv.length, 0)}</td><td className="n">{inr(gstr1.b2b.reduce((a, x) => a + x.inv.reduce((b, i) => b + i.itms.reduce((c, m) => c + m.itm_det.txval, 0), 0), 0))}</td><td className="n">{inr(gstr1.b2b.reduce((a, x) => a + x.inv.reduce((b, i) => b + i.itms.reduce((c, m) => c + m.itm_det.iamt + m.itm_det.camt + m.itm_det.samt, 0), 0), 0))}</td></tr>
          <tr><td>B2C small (unregistered)</td><td className="n">{gstr1.b2cs.length}</td><td className="n">{inr(gstr1.b2cs.reduce((a, x) => a + x.txval, 0))}</td><td className="n">{inr(gstr1.b2cs.reduce((a, x) => a + x.iamt + x.camt + x.samt, 0))}</td></tr>
          <tr><td>HSN summary</td><td className="n">{gstr1.hsn.data.length}</td><td className="n">{inr(gstr1.hsn.data.reduce((a, x) => a + x.txval, 0))}</td><td className="n">{inr(gstr1.hsn.data.reduce((a, x) => a + x.iamt + x.camt + x.samt, 0))}</td></tr></tbody></table></div></div>
      <div className="card"><div className="row sp"><h3>GSTR-3B: summary return</h3><div className="row">
        <button className="btn ghost sm" onClick={() => downloadJson(`GSTR3B_${mmyyyy}.json`, gstr3b)}>Download JSON</button>
        <button className="btn acc sm" disabled={!!busy} onClick={() => file('GSTR3B', gstr3b)}>{busy === 'GSTR3B' ? 'Sending…' : 'Submit via GSP'}</button></div></div>
        <div className="tw"><table><thead><tr><th>Head</th><th className="n">IGST</th><th className="n">CGST</th><th className="n">SGST</th></tr></thead><tbody>
          <tr><td>Output tax (3.1a)</td><td className="n">{inr(tot.iamt)}</td><td className="n">{inr(tot.camt)}</td><td className="n">{inr(tot.samt)}</td></tr>
          <tr><td>Input tax credit (4A)</td><td className="n">{inr(itc.iamt)}</td><td className="n">{inr(itc.camt)}</td><td className="n">{inr(itc.samt)}</td></tr></tbody></table></div></div>
      <div className="card"><h3>Submission history</h3><div className="tw"><table><thead><tr><th>Return</th><th>Period</th><th>Reference</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>{S.filings.slice().reverse().map(f => <tr key={f.id}><td>{f.kind}</td><td>{f.period}</td><td>{f.ref}</td><td><span className={'pill ' + (f.mode === 'live' ? 'd' : 'p')}>{f.status}</span></td><td>{fd(String(f.date).slice(0, 10))}</td></tr>)}</tbody></table>
        {!S.filings.length && <div className="empty">No submissions yet.</div>}</div></div>
      <p className="lead">{sandbox ? 'Sandbox mode: submissions are simulated and nothing reaches the GST portal. ' : ''}The JSON follows the GST offline-tool layout; validate it in the GST Offline Tool before uploading. Filing on the portal needs the authorised signatory’s OTP, EVC or DSC. This is a preparation aid, so have a tax professional review before you file. Credit notes to registered customers appear under CDNR and the others reduce the B2C totals. Inter-state B2C invoices above the B2CL limit and debit notes are not handled yet.</p></div>
  )
}

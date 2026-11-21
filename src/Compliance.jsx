import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { api } from './api'
import { calc, isIntra, downloadJson } from './utils'

export const QrImg = ({ value, size = 90 }) => {
  const [u, setU] = useState('')
  useEffect(() => { QRCode.toDataURL(String(value), { margin: 1, width: size * 2 }).then(setU) }, [value])
  return u ? <img src={u} width={size} height={size} alt="QR code" /> : null
}

// E-invoice (IRN) and e-way bill panel shown on an approved invoice.
export function Compliance({ d, S, toast, reload }) {
  const comp = S.compliance.find(c => c.doc_id === d.id) || {}, cu = S.customers.find(c => c.id === d.cust) || {}
  const [v, setV] = useState({ vehicle: comp.vehicle || '', distance: comp.distance || '' }), [busy, setBusy] = useState('')
  const net = calc(d, isIntra(S.company, cu)).n, sandbox = S.gst_mode !== 'live'
  const run = async (key, fn, ok) => { setBusy(key); try { await fn(); toast(ok); await reload() } catch (e) { toast(e.message) } setBusy('') }
  const dl = async (path, name) => { try { downloadJson(name, await api(path)) } catch (e) { toast(e.message) } }
  const q = `?vehicle=${encodeURIComponent(v.vehicle)}&distance=${encodeURIComponent(v.distance)}`
  const irn = comp.irn_status, eway = comp.eway_status
  return (
    <div className="card noprint"><div className="row sp"><h3>GST compliance</h3><span className={'pill ' + (sandbox ? 'p' : 'd')}>{sandbox ? 'Sandbox: simulated responses' : 'Live via GSP'}</span></div>
      <div className="grid">
        <div><label>E-invoice (IRN)</label>
          <div style={{ marginBottom: 10 }}>{irn === 'active' ? <span className="pill d">IRN generated</span> : irn === 'cancelled' ? <span className="pill o">IRN cancelled</span> : <span className="pill q">Not generated</span>}
            {!S.company.einvoice && irn !== 'active' && <small style={{ color: 'var(--mut)' }}> E-invoicing is off in Company management.</small>}</div>
          {comp.irn && <small style={{ wordBreak: 'break-all', color: 'var(--mut)' }}>IRN {comp.irn}<br />Ack {comp.ack_no}</small>}
          <p className="row">
            <button className="btn ghost sm" onClick={() => dl(`/docs/${d.id}/einvoice`, `einvoice-${d.no}.json`)}>Download JSON</button>
            {irn !== 'active' && irn !== 'cancelled' && <button className="btn acc sm" disabled={!!busy} onClick={() => run('irn', () => api(`/docs/${d.id}/einvoice`, 'POST'), 'IRN generated')}>{busy === 'irn' ? 'Working…' : 'Generate IRN'}</button>}
            {irn === 'active' && <button className="btn bad sm" disabled={!!busy} onClick={() => confirm('Cancel this IRN? This is only allowed within 24 hours.') && run('cirn', () => api(`/docs/${d.id}/einvoice/cancel`, 'POST', { reason: '1' }), 'IRN cancelled')}>Cancel IRN</button>}</p></div>
        <div><label>E-way bill</label>
          <div style={{ marginBottom: 10 }}>{eway === 'active' ? <span className="pill d">E-way bill {comp.eway_no}</span> : eway === 'cancelled' ? <span className="pill o">Cancelled</span> : net > 50000 ? <span className="pill p">Usually required (above ₹50,000)</span> : <span className="pill q">Optional</span>}</div>
          {eway === 'active' ? <small style={{ color: 'var(--mut)' }}>Vehicle {comp.vehicle} · {comp.distance} km · valid till {String(comp.eway_valid).slice(0, 10)}</small> : <>
            <div className="row" style={{ flexWrap: 'nowrap' }}><input placeholder="Vehicle no. WB74AB1234" value={v.vehicle} onChange={e => setV({ ...v, vehicle: e.target.value })} /><input type="number" placeholder="Distance km" value={v.distance} onChange={e => setV({ ...v, distance: e.target.value })} style={{ maxWidth: 120 }} /></div></>}
          <p className="row">
            {eway !== 'active' && <button className="btn ghost sm" onClick={() => dl(`/docs/${d.id}/eway${q}`, `eway-${d.no}.json`)}>Download JSON</button>}
            {eway !== 'active' && <button className="btn acc sm" disabled={!!busy} onClick={() => run('ewb', () => api(`/docs/${d.id}/eway`, 'POST', v), 'E-way bill generated')}>{busy === 'ewb' ? 'Working…' : 'Generate e-way bill'}</button>}
            {eway === 'active' && <button className="btn bad sm" disabled={!!busy} onClick={() => confirm('Cancel this e-way bill?') && run('cewb', () => api(`/docs/${d.id}/eway/cancel`, 'POST'), 'E-way bill cancelled')}>Cancel e-way bill</button>}</p></div></div>
      <small style={{ color: 'var(--mut)' }}>{sandbox ? 'Sandbox mode creates test IRNs and e-way numbers that are not registered with the government portals. Use Download JSON to upload on the IRP / e-way bill portal, or switch the server to live mode with your GSP credentials.' : 'Requests are sent to your GSP and registered on the government portals.'} Validity rules and thresholds change, so confirm applicability with your tax advisor.</small></div>
  )
}

import { useState } from 'react'
import { api } from './api'
import { inr, today } from './utils'
import { Field, Modal } from './ui'

// Records a customer receipt (kind "receipt") or a supplier payment (kind "payment"); the server posts the journal entry.
export default function PayModal({ kind, doc, total, onClose, toast, reload }) {
  const bal = Math.round(((total ?? doc.total ?? 0) - (doc.paid_amt || 0)) * 100) / 100
  const [f, setF] = useState({ amount: bal, mode: 'bank', date: today(), ref: '' }), [busy, setBusy] = useState(false)
  const save = async () => { setBusy(true); try { await api('/payments', 'POST', { ...f, kind, doc_id: doc.id }); toast('Payment recorded'); await reload(); onClose() } catch (e) { toast(e.message) } setBusy(false) }
  return (
    <Modal title={(kind === 'receipt' ? 'Receive payment · ' : 'Pay supplier · ') + doc.no} onClose={onClose} w={460}>
      <p className="lead" style={{ margin: '0 0 12px' }}>Outstanding balance: <b style={{ color: 'var(--ink)' }}>{inr(bal)}</b></p>
      <div className="grid">
        <Field l="Amount"><input type="number" min="0" step="0.01" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
        <Field l="Paid into / from"><select value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}><option value="bank">Bank account</option><option value="cash">Cash in hand</option></select></Field>
        <Field l="Date"><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <Field l="Reference (UTR / cheque no.)"><input value={f.ref} onChange={e => setF({ ...f, ref: e.target.value })} /></Field></div>
      <p><button className="btn acc" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Record payment'}</button></p>
    </Modal>
  )
}

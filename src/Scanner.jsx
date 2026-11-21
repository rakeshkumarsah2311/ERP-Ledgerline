import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

// Camera scanning uses the browser BarcodeDetector API (Chrome, Edge, Android). USB/Bluetooth scanners work through the text box.
export function ScanModal({ onCode, onClose }) {
  const vid = useRef(), [err, setErr] = useState(''), [txt, setTxt] = useState('')
  useEffect(() => {
    let done = false, stream, timer
    ;(async () => {
      if (!('BarcodeDetector' in window)) return setErr('Camera scanning is not supported in this browser. Type the code below or use a USB scanner.')
      try {
        const det = new window.BarcodeDetector()
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        vid.current.srcObject = stream; await vid.current.play()
        timer = setInterval(async () => { try { const r = await det.detect(vid.current); if (r[0] && !done) { done = true; onCode(r[0].rawValue) } } catch (e) {} }, 400)
      } catch (e) { setErr('Camera not available. Allow camera access (HTTPS is required), or type the code below.') }
    })()
    return () => { clearInterval(timer); stream && stream.getTracks().forEach(t => t.stop()) }
  }, [])
  return (
    <div className="mod" onClick={onClose}><div onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
      <div className="row sp"><h3>Scan barcode or QR code</h3><button type="button" className="btn ghost sm" onClick={onClose}>Close</button></div>
      {err ? <div className="warn" style={{ marginTop: 12 }}>{err}</div> : <video ref={vid} muted playsInline style={{ width: '100%', borderRadius: 10, marginTop: 12, background: '#000' }} />}
      <label style={{ marginTop: 14 }}>Or enter / scan with a USB scanner</label>
      <input autoFocus value={txt} onChange={e => setTxt(e.target.value)} placeholder="Code, then press Enter" onKeyDown={e => { if (e.key === 'Enter' && txt.trim()) { e.preventDefault(); onCode(txt.trim()) } }} />
    </div></div>
  )
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
export function LabelModal({ p, onClose }) {
  const [img, setImg] = useState(''), val = p.barcode || p.code
  useEffect(() => { QRCode.toDataURL(String(val), { margin: 1, width: 240 }).then(setImg) }, [val])
  const print = () => {
    const w = window.open('', '_blank', 'width=360,height=460'); if (!w) return
    w.document.write(`<body style="font-family:sans-serif;text-align:center;padding:16px"><img src="${img}" width="200"/><h3 style="margin:6px 0">${esc(p.name)}</h3><div>${esc(val)}</div><b>₹${esc(p.price)}</b></body>`)
    w.document.close(); w.focus(); w.print()
  }
  return (
    <div className="mod" onClick={onClose}><div onClick={e => e.stopPropagation()} style={{ maxWidth: 340, textAlign: 'center' }}>
      <h3>Product label</h3>{img && <img src={img} width="200" alt="QR code" style={{ background: '#fff', borderRadius: 8, margin: '12px 0 4px' }} />}
      <div><b>{p.name}</b></div><div style={{ color: 'var(--mut)' }}>{val}</div>
      <p className="row" style={{ justifyContent: 'center' }}><button className="btn acc" onClick={print}>Print label</button><button className="btn ghost" onClick={onClose}>Close</button></p>
    </div></div>
  )
}

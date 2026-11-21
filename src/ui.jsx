import { useState, useMemo } from 'react'
import { ago } from './utils'
export const Field = ({ l, children }) => <div><label>{l}</label>{children}</div>
export function Upload({ l, v, set }) {
  const pick = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => set(r.result); r.readAsDataURL(f) }
  return (
    <div><label>{l}</label><div className="up">
      <div className="th">{v ? (v.startsWith('data:image') ? <img src={v} alt="" /> : 'File') : 'None'}</div>
      <label className="btn ghost sm" style={{ margin: 0, cursor: 'pointer' }}>Upload<input type="file" accept="image/*,.pdf" hidden onChange={pick} /></label>
      {v && <button className="btn bad sm" onClick={() => set('')}>Remove</button>}
    </div></div>
  )
}
export const Status = ({ d }) => d.type === 'quotation' ? <span className="pill q">Quotation</span>
  : d.status === 'pending' ? <span className="pill p">Awaiting approval</span> : d.status === 'rejected' ? <span className="pill o">Rejected</span>
  : d.paid ? <span className="pill d">Paid</span> : ago(d.date) > 7 ? <span className="pill o">Overdue</span> : <span className="pill p">Pending</span>

export function Bars({ data, h = 160, fmt = v => v }) {
  const max = Math.max(1, ...data.map(d => d.v))
  return (
    <svg viewBox={`0 0 ${data.length * 40} ${h + 26}`} style={{ width: '100%', maxHeight: 260 }} role="img">
      {data.map((d, i) => { const bh = (d.v / max) * h; return (
        <g key={i}><rect x={i * 40 + 6} y={h - bh + 12} width={28} height={bh} rx={4} fill={d.f ? '#2f6fb8' : '#14b8a6'} />
          <text x={i * 40 + 20} y={h + 24} textAnchor="middle" fontSize="9" fill="#8aa5b5">{d.l}</text>
          <text x={i * 40 + 20} y={h - bh + 8} textAnchor="middle" fontSize="9" fill="#e6f1f5">{fmt(d.v)}</text></g>) })}
    </svg>
  )
}

const IC = { dash: 'M3 11l9-8 9 8M5 9.5V21h14V9.5', company: 'M4 21V5l8-2 8 2v16M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4', users: 'M16 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7M21 20v-2a4 4 0 00-3-3.9M16 3.1a3.5 3.5 0 010 6.8',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8', layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5', wh: 'M3 21V9l9-6 9 6v12M7 21v-8h10v8', truck: 'M2 6h11v10H2zM13 9h4l4 4v3h-8M6 19a2 2 0 100-4 2 2 0 000 4M17 19a2 2 0 100-4 2 2 0 000 4',
  file: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h6', quote: 'M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2zM9 9h6', spark: 'M3 17l6-6 4 4 8-8M15 7h6v6', bars: 'M5 21V10M12 21V4M19 21v-7', cart: 'M3 4h2l2.5 12h11L21 8H6M9 20a1 1 0 100-2 1 1 0 000 2M17 20a1 1 0 100-2 1 1 0 000 2',
  book: 'M4 4h12a3 3 0 013 3v13H7a3 3 0 01-3-3zM8 4v13', gst: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', check: 'M5 13l4 4L19 7', target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2', bell: 'M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0', sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4', moon: 'M21 13A9 9 0 1111 3a7 7 0 0010 10z',
  menu: 'M4 6h16M4 12h16M4 18h16', out: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9', cog: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4', search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3', dot: 'M12 12h.01' }
export const Icon = ({ n, s = 18 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={IC[n] || IC.dot} /></svg>

const val = x => (x && typeof x === 'object' ? '' : x ?? '')
// Sortable, paginated table. cols: [{ h, f(row), v?(row) for sorting, n?: right-align, nosort? }]
export function DataTable({ cols, rows, size = 10, empty = 'Nothing here yet.', foot }) {
  const [sort, setSort] = useState({ k: -1, d: 1 }), [pg, setPg] = useState(0)
  const sorted = useMemo(() => {
    if (sort.k < 0) return rows
    const c = cols[sort.k], g = r => val(c.v ? c.v(r) : c.f(r))
    return [...rows].sort((a, b) => { const x = g(a), y = g(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.d })
  }, [rows, sort])
  const pages = Math.max(1, Math.ceil(sorted.length / size)), cur = Math.min(pg, pages - 1), view = sorted.slice(cur * size, cur * size + size)
  return (<>
    <div className="tw"><table><thead><tr>{cols.map((c, i) => <th key={i} className={(c.n ? 'n ' : '') + (c.nosort || !c.h ? '' : 'sortable')} onClick={() => !c.nosort && c.h && setSort({ k: i, d: sort.k === i ? -sort.d : 1 })}>{c.h}{sort.k === i ? (sort.d > 0 ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
      <tbody>{view.map((r, ri) => <tr key={r.id ?? ri}>{cols.map((c, i) => <td key={i} className={c.n ? 'n' : ''}>{c.f(r)}</td>)}</tr>)}</tbody>{foot && <tfoot>{foot}</tfoot>}</table>
      {!rows.length && <div className="empty">{empty}</div>}</div>
    {pages > 1 && <div className="pager"><span>{sorted.length} records · page {cur + 1} of {pages}</span><span className="row"><button className="btn ghost sm" disabled={cur === 0} onClick={() => setPg(cur - 1)}>Previous</button><button className="btn ghost sm" disabled={cur >= pages - 1} onClick={() => setPg(cur + 1)}>Next</button></span></div>}
  </>)
}

export const Modal = ({ title, onClose, children, w }) => <div className="mod" onClick={onClose}><div onClick={e => e.stopPropagation()} style={w ? { maxWidth: w } : null}><div className="row sp" style={{ marginBottom: 12 }}><h3>{title}</h3><button className="btn ghost sm" onClick={onClose}>Close</button></div>{children}</div></div>
export const Skeleton = () => <div className="page"><div className="skel" style={{ width: '30%', height: 30 }} /><div className="kpis">{[1, 2, 3, 4].map(i => <div key={i} className="skel" style={{ height: 96 }} />)}</div><div className="skel" style={{ height: 260 }} /></div>

export function Spark({ data, color = '#14b8a6' }) {
  const max = Math.max(...data, 1), min = Math.min(...data, 0), pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${28 - ((v - min) / Math.max(1, max - min)) * 26}`).join(' ')
  return <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: 30 }}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
}
export function Kpi({ l, v, delta, sub, data }) {
  return <div className="kpi"><label>{l}</label><b>{v}</b>{delta != null && <small className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs previous</small>}{sub && <small style={{ color: 'var(--mut)' }}>{sub}</small>}{data && <Spark data={data} />}</div>
}
// Multi-series line chart: series [{ name, color, data }], labels [..]
export function Trend({ series, labels, h = 190 }) {
  const all = series.flatMap(s => s.data), max = Math.max(...all, 1), min = Math.min(...all, 0), W = 600, x = i => 30 + (i / Math.max(1, labels.length - 1)) * (W - 50), y = v => 10 + (1 - (v - min) / Math.max(1, max - min)) * (h - 40)
  return (<svg viewBox={`0 0 ${W} ${h}`} style={{ width: '100%' }} role="img">
    <line x1="30" x2={W - 20} y1={y(0)} y2={y(0)} stroke="#8aa5b5" strokeOpacity=".35" />
    {series.map(s => <polyline key={s.name} points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" />)}
    {labels.map((l, i) => <text key={i} x={x(i)} y={h - 6} fontSize="11" textAnchor="middle" fill="#8aa5b5">{l}</text>)}
    {series.map((s, i) => <g key={s.name}><rect x={40 + i * 110} y="0" width="10" height="4" fill={s.color} /><text x={54 + i * 110} y="6" fontSize="10" fill="#8aa5b5">{s.name}</text></g>)}</svg>)
}

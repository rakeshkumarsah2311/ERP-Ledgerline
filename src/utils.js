import { useState, useEffect } from 'react'
const LOC = { INR: 'en-IN', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB', AED: 'en-AE' }
let CUR = 'INR'
export const setCurrency = c => { CUR = LOC[c] ? c : 'INR' }
export const inr = n => new Intl.NumberFormat(LOC[CUR], { style: 'currency', currency: CUR, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))
export const fd = d => (d ? d.split('-').reverse().join('/') : '')
export const today = () => new Date().toISOString().slice(0, 10)
export const uid = () => Math.random().toString(36).slice(2, 9)
export const ago = d => Math.floor((Date.now() - new Date(d)) / 864e5)
export const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const isIntra = (co, cu) => !co.gst || !cu.gst || co.gst.slice(0, 2) === cu.gst.slice(0, 2)
// GST per line: taxable value (after discount) x the line's own rate, split into CGST+SGST or IGST.
export const calc = (d, intra = true) => {
  const s = d.items.reduce((a, i) => a + i.price * i.qty, 0), disc = Math.min(+d.discount || 0, s), t = s - disc, by = {}
  d.items.forEach(i => { const r = i.rate ?? 18; by[r] = (by[r] || 0) + (s ? i.price * i.qty * (1 - disc / s) : 0) })
  const rates = Object.entries(by).map(([r, base]) => ({ r: +r, base, tax: (base * r) / 100 })), g = rates.reduce((a, x) => a + x.tax, 0)
  return { s, t, g, n: t + g, rates, cgst: intra ? g / 2 : 0, sgst: intra ? g / 2 : 0, igst: intra ? 0 : g }
}
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const two = n => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''))
const three = n => (n > 99 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + two(n % 100)
export const words = amt => {
  let n = Math.floor(amt), ps = Math.round((amt - n) * 100), o = ''
  for (const [v, l] of [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']]) if (n >= v) { o += three(Math.floor(n / v)) + ' ' + l + ' '; n %= v }
  o += three(n)
  return 'Rupees ' + (o.trim() || 'Zero') + (ps ? ' and ' + two(ps) + ' Paise' : '') + ' only'
}
export const wa = (ph, msg) => { let p = String(ph || '').replace(/\D/g, ''); if (p.length === 10) p = '91' + p; return `https://wa.me/${p}?text=${encodeURIComponent(msg)}` }
export const CATS = { Electrical: ['Wires', 'Switches', 'Lighting'], Plumbing: ['Faucets', 'Pipes', 'Fittings'], Carpentry: ['Wood plank', 'Plywood', 'Hardware'], Paints: ['Wall primer', 'Emulsion', 'Enamel'] }
export const UOM = ['Unit', 'Box', 'Litre']
export function useStore(key, init) {
  const [v, s] = useState(() => { try { const x = localStorage.getItem(key); if (x) return JSON.parse(x) } catch (e) {} return init })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)) } catch (e) {} }, [v])
  return [v, s]
}
const line = { code: '1234', name: 'Green Ply - Ply Wood', uom: 'Unit', price: 1200, qty: 1 }
export const seed = {
  company: { name: 'Sharma Building Supplies', address: '12 Hill Cart Road, Siliguri, West Bengal', phone: '9800000000', gst: '19ABCDE1234F1Z5', pan: 'ABCDE1234F', bank: 'State Bank of India\nA/C 00112233445\nIFSC SBIN0001234', logo: '', qr: '', seal: '' },
  customers: [{ id: 'c1', name: 'Cummins', attn: 'Mr. Rao', phone: '9811111111', a1: 'Plot 4, Industrial Area', a2: 'Siliguri', gst: '19AAACC1206D1ZM', pan: 'AAACC1206D', logo: '' }, { id: 'c2', name: 'Tata Projects', attn: 'Ms. Das', phone: '9822222222', a1: 'Sevoke Road', a2: 'Siliguri', gst: '19AAACT2803M1Z4', pan: 'AAACT2803M', logo: '' }],
  products: [{ id: 'p1', code: '1234', name: 'Green Ply - Ply Wood', price: 1200, uom: 'Unit', cat: 'Carpentry', sub: 'Plywood', img: '', manage: true, qty: 120 }, { id: 'p2', code: '2001', name: 'Copper Wire 1.5mm', price: 2400, uom: 'Box', cat: 'Electrical', sub: 'Wires', img: '', manage: true, qty: 60 }, { id: 'p3', code: '3002', name: 'Chrome Faucet', price: 650, uom: 'Unit', cat: 'Plumbing', sub: 'Faucets', img: '', manage: true, qty: 8 }, { id: 'p4', code: '4005', name: 'Wall Primer 20L', price: 3100, uom: 'Litre', cat: 'Paints', sub: 'Wall primer', img: '', manage: false, qty: 0 }],
  drivers: [{ id: 'd1', name: 'Ramesh Thapa', phone: '9833333333', res: '9844444444', proof: '' }],
  docs: [{ id: 'i1', type: 'invoice', no: '1234', date: '2024-04-12', cust: 'c1', driver: 'd1', items: [line], discount: 0, paid: false }, { id: 'i2', type: 'invoice', no: '1235', date: '2024-04-12', cust: 'c1', driver: 'd1', items: [line], discount: 0, paid: false }],
}
export const downloadJson = (name, obj) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = name; a.click() }
// CSV with a BOM so Excel opens it with the right characters.
export const downloadCsv = (name, rows) => { const t = rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv' })); a.download = name; a.click() }
export const fyStart = (co, now = new Date()) => { const m = +co.fy_start || 4, y = now.getMonth() + 1 >= m ? now.getFullYear() : now.getFullYear() - 1; return `${y}-${String(m).padStart(2, '0')}-01` }

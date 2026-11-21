import crypto from 'crypto'

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const need = (c, m) => { if (!c) throw new Error(m) }
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100
const dmy = s => String(s).split('-').reverse().join('/')
const UQC = { Unit: 'NOS', Box: 'BOX', Litre: 'LTR' }

// Financial year in YYYY-YY form (April to March), derived from the document date.
export const fy = date => { const [y, m] = String(date).split('-').map(Number), s = m >= 4 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}` }
// IRN = SHA-256 of supplier GSTIN + financial year + document type + document number. In live mode the IRP's own IRN is used.
export const irnOf = (gstin, date, type, no) => crypto.createHash('sha256').update(`${gstin}${fy(date)}${type}${no}`).digest('hex')

// Per-line taxable value (discount spread pro rata) and GST split.
const lines = (d, items, intra) => {
  const gross = items.reduce((a, i) => a + i.price * i.qty, 0), disc = Math.min(Number(d.discount) || 0, gross)
  return items.map((i, k) => { const g = i.price * i.qty, dc = gross ? (disc * g) / gross : 0, ass = g - dc, rt = Number(i.rate ?? 18), tax = (ass * rt) / 100
    return { i, k, g, dc, ass, rt, cg: intra ? tax / 2 : 0, sg: intra ? tax / 2 : 0, ig: intra ? 0 : tax } })
}

// Payload in the NIC e-invoice schema (version 1.1), ready to upload to the IRP or send through a GSP.
export function buildEinvoice(d, items, co, cu) {
  need(d.type === 'invoice', 'Only invoices can be e-invoiced')
  need(GSTIN.test(co.gst || ''), 'Add a valid company GSTIN in Company management')
  need(GSTIN.test(cu.gst || ''), 'E-invoicing is for B2B sales: the customer needs a valid GSTIN')
  need(/^\d{6}$/.test(co.pincode || '') && /^\d{6}$/.test(cu.pincode || ''), 'Add a 6-digit pincode for your company and for the customer')
  need(String(d.no).length <= 16, 'Invoice number must be 16 characters or fewer')
  const intra = co.gst.slice(0, 2) === cu.gst.slice(0, 2), L = lines(d, items, intra), sum = k => r2(L.reduce((a, x) => a + x[k], 0))
  const tot = r2(L.reduce((a, x) => a + x.ass + x.cg + x.sg + x.ig, 0))
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: String(d.no), Dt: dmy(d.date) },
    SellerDtls: { Gstin: co.gst, LglNm: co.name, Addr1: co.address || '-', Loc: String(co.address || 'NA').split(',').pop().trim().slice(0, 50) || 'NA', Pin: Number(co.pincode), Stcd: co.gst.slice(0, 2), Ph: String(co.phone || '').replace(/\D/g, '') || undefined },
    BuyerDtls: { Gstin: cu.gst, LglNm: cu.name, Pos: cu.gst.slice(0, 2), Addr1: cu.a1 || '-', Loc: (cu.a2 || 'NA').slice(0, 50), Pin: Number(cu.pincode), Stcd: cu.gst.slice(0, 2) },
    ItemList: L.map(x => ({ SlNo: String(x.k + 1), PrdDesc: x.i.name, IsServc: 'N', HsnCd: x.i.hsn || '', Qty: x.i.qty, Unit: UQC[x.i.uom] || 'OTH', UnitPrice: x.i.price, TotAmt: r2(x.g), Discount: r2(x.dc), AssAmt: r2(x.ass), GstRt: x.rt,
      IgstAmt: r2(x.ig), CgstAmt: r2(x.cg), SgstAmt: r2(x.sg), CesRt: 0, CesAmt: 0, TotItemVal: r2(x.ass + x.cg + x.sg + x.ig) })),
    ValDtls: { AssVal: sum('ass'), CgstVal: sum('cg'), SgstVal: sum('sg'), IgstVal: sum('ig'), CesVal: 0, Discount: 0, RndOffAmt: 0, TotInvVal: tot },
  }
}

// Payload for the e-way bill bulk-generation JSON (version 1.0.0123).
export function buildEway(d, items, co, cu, t) {
  const veh = String(t.vehicle || '').replace(/\s|-/g, '').toUpperCase(), dist = Number(t.distance)
  need(GSTIN.test(co.gst || ''), 'Add a valid company GSTIN in Company management')
  need(/^\d{6}$/.test(co.pincode || '') && /^\d{6}$/.test(cu.pincode || ''), 'Add a 6-digit pincode for your company and for the customer')
  need(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(veh), 'Enter a valid vehicle number, for example WB74AB1234')
  need(dist > 0 && dist <= 4000, 'Enter the distance in km (1 to 4000)')
  const intra = co.gst.slice(0, 2) === (cu.gst || co.gst).slice(0, 2), L = lines(d, items, intra), sum = k => r2(L.reduce((a, x) => a + x[k], 0))
  return { version: '1.0.0123', billLists: [{
    userGstin: co.gst, supplyType: 'O', subSupplyType: 1, docType: 'INV', docNo: String(d.no), docDate: dmy(d.date),
    fromGstin: co.gst, fromTrdName: co.name, fromAddr1: co.address || '-', fromPlace: String(co.address || 'NA').split(',').pop().trim(), fromPincode: Number(co.pincode), fromStateCode: Number(co.gst.slice(0, 2)), actFromStateCode: Number(co.gst.slice(0, 2)),
    toGstin: cu.gst || 'URP', toTrdName: cu.name, toAddr1: cu.a1 || '-', toPlace: cu.a2 || 'NA', toPincode: Number(cu.pincode), toStateCode: Number((cu.gst || co.gst).slice(0, 2)), actToStateCode: Number((cu.gst || co.gst).slice(0, 2)),
    transactionType: 1, totalValue: sum('ass'), cgstValue: sum('cg'), sgstValue: sum('sg'), igstValue: sum('ig'), cessValue: 0, totInvValue: r2(L.reduce((a, x) => a + x.ass + x.cg + x.sg + x.ig, 0)),
    transMode: '1', transDistance: String(dist), vehicleNo: veh, vehicleType: 'R',
    itemList: L.map(x => ({ productName: x.i.name, hsnCode: Number(x.i.hsn) || 0, quantity: x.i.qty, qtyUnit: UQC[x.i.uom] || 'OTH', taxableAmount: r2(x.ass), cgstRate: intra ? x.rt / 2 : 0, sgstRate: intra ? x.rt / 2 : 0, igstRate: intra ? 0 : x.rt, cessRate: 0 })),
  }] }
}

const iso = x => { if (!x) return ''; try { const s = String(x).replace(' ', 'T'); return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + '+05:30').toISOString() } catch (e) { return '' } }

// One adapter for every portal call. Sandbox (default) simulates the response so the whole flow can be tested.
// Live mode posts to your GSP (e.g. ClearTax, Masters India) using credentials from the server environment.
export async function gsp(kind, payload, ctx = {}) {
  const mode = process.env.GST_MODE === 'live' ? 'live' : 'sandbox'
  if (mode === 'live') {
    const base = process.env.GSP_URL
    need(base && process.env.GSP_CLIENT_ID && process.env.GSP_CLIENT_SECRET, 'Live mode needs GSP_URL, GSP_CLIENT_ID and GSP_CLIENT_SECRET on the server')
    const r = await fetch(`${base.replace(/\/$/, '')}/${kind}`, { method: 'POST', body: JSON.stringify(payload || {}),
      headers: { 'Content-Type': 'application/json', client_id: process.env.GSP_CLIENT_ID, client_secret: process.env.GSP_CLIENT_SECRET, gstin: process.env.GSP_GSTIN || '', user_name: process.env.GSP_USER || '', password: process.env.GSP_PASSWORD || '' } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.message || j.error || `The GSP rejected the request (${r.status})`)
    const x = j.result || j.data || j
    if (kind === 'einvoice') return { mode, irn: x.Irn, ackNo: String(x.AckNo), ackDt: iso(x.AckDt), qr: x.SignedQRCode || '' }
    if (kind === 'eway') return { mode, ewbNo: String(x.ewayBillNo || x.EwbNo), validTill: iso(x.validUpto || x.EwbValidTill) }
    return { mode, ok: true, ref: String(x.ref_id || x.reference_id || x.ack_num || 'submitted') }
  }
  if (kind === 'einvoice') return { mode, irn: ctx.irn, ackNo: String(Date.now()).slice(-13), ackDt: new Date().toISOString(), qr: `SANDBOX|${ctx.irn}` }
  if (kind === 'eway') return { mode, ewbNo: String(Math.floor(1e11 + Math.random() * 9e11)), validTill: new Date(Date.now() + Math.max(1, Math.ceil(ctx.distance / 200)) * 864e5).toISOString() }
  return { mode, ok: true, ref: 'SBX-' + crypto.randomBytes(4).toString('hex').toUpperCase() }
}

export default async function handler(req, res) {
  const backend = process.env.BACKEND_URL?.trim().replace(/\/$/, '')
  if (!backend) {
    res.status(503).setHeader('Cache-Control', 'no-store')
    return res.json({ error: 'The production API is not connected yet. Configure BACKEND_URL for this Vercel project.' })
  }

  let base
  try { base = new URL(backend) } catch {
    res.status(500).setHeader('Cache-Control', 'no-store')
    return res.json({ error: 'The production API URL is invalid. Check the BACKEND_URL setting.' })
  }
  if (base.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    res.status(500).setHeader('Cache-Control', 'no-store')
    return res.json({ error: 'The production API URL must use HTTPS.' })
  }

  const incoming = new URL(req.url, 'https://vercel.invalid')
  const route = incoming.pathname.replace(/^\/api\/?/, '')
  if (!route) return res.status(404).json({ error: 'API route not found.' })

  const headers = { Accept: 'application/json', 'Cache-Control': 'no-store' }
  for (const name of ['authorization', 'content-type', 'user-agent', 'x-forwarded-for']) {
    if (req.headers[name]) headers[name] = req.headers[name]
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method)
  const body = hasBody && req.body !== undefined
    ? (typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body))
    : undefined

  try {
    const upstream = await fetch(`${base.origin}/api/${route}${incoming.search}`, { method: req.method, headers, body })
    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    res.status(upstream.status).send(await upstream.text())
  } catch (error) {
    console.error('Production API proxy failed:', error.message)
    res.status(502).setHeader('Cache-Control', 'no-store')
    res.json({ error: 'The production backend could not be reached. Please try again shortly.' })
  }
}

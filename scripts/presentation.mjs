import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = Number(process.env.PORT) || 3001
const webPort = Number(process.env.PRESENTATION_WEB_PORT) || 5173
const children = []
let stopping = false

function start(label, args, extraEnv = {}) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...extraEnv } })
  children.push(child)
  child.on('error', error => {
    console.error(`${label} could not start: ${error.message}`)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    if (stopping) return
    if (signal || code) console.error(`${label} stopped${signal ? ` (${signal})` : ` with exit code ${code}`}.`)
    shutdown(code || 0)
  })
  return child
}

function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) if (child.exitCode === null) child.kill()
  process.exitCode = code
}

process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())

const apiReady = async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`)
    if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) return false
    return (await response.json()).status === 'ok'
  } catch { return false }
}

let ready = await apiReady()
let server
if (ready) console.log(`Using the API already running on port ${port}.`)
else {
  server = start('API server', ['server/index.js'])
  for (let i = 0; i < 200 && !stopping && server.exitCode === null; i++) {
    if (await apiReady()) { ready = true; break }
    await delay(150)
  }
}

if (!ready) {
  console.error(`API server did not become ready on port ${port}.`)
  shutdown(1)
} else {
  const configure = spawn(process.execPath, ['scripts/configure-demo-login.mjs'], { stdio: 'inherit', env: process.env })
  const configureCode = await new Promise(resolve => configure.once('exit', resolve))
  if (configureCode !== 0) {
    console.error('Could not configure the local demo login.')
    shutdown(configureCode || 1)
  }
}

if (ready && !stopping) {
  console.log('Loading the sample presentation business (existing demo data is kept)...')
  const seed = spawn(process.execPath, ['scripts/demo-seed.mjs'], { stdio: 'inherit', env: process.env })
  const code = await new Promise(resolve => seed.once('exit', resolve))
  if (code !== 0) {
    console.error('Could not prepare the demo data.')
    shutdown(code || 1)
  } else if (!stopping) {
    console.log(`\nPresentation site: http://localhost:${webPort}`)
    console.log(`Demo login: ${process.env.DEMO_EMAIL || 'admin@ledgerline.test'}  /  ${process.env.DEMO_PASSWORD ? '(password entered in terminal)' : 'Demo@1234'}`)
    console.log(`To let a client on the same Wi-Fi open it, use this computer’s LAN IP with port ${webPort}.`)
    start('Vite', ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', String(webPort)], { VITE_PRESENTATION_MODE: '1' })
  }
}

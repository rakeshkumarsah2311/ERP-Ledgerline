import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import net from 'node:net'

const port = Number(process.env.PORT) || 3001
const children = []
let stopping = false

function start(label, args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env })
  children.push(child)
  child.on('exit', (code, signal) => {
    if (stopping) return
    console.error(`${label} stopped${signal ? ` (${signal})` : ` with exit code ${code}`}.`)
    shutdown(code || 1)
  })
  return child
}

function canConnect() {
  return new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1')
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
  })
}

function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) if (child.exitCode === null) child.kill()
  process.exitCode = code
}

process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())

const server = start('API server', ['server/index.js'])
const deadline = Date.now() + 30000
while (!stopping && server.exitCode === null && Date.now() < deadline) {
  if (await canConnect()) break
  await delay(150)
}

if (stopping) process.exit(1)
if (server.exitCode !== null) process.exit(server.exitCode || 1)
if (!(await canConnect())) {
  console.error(`API server did not start listening on port ${port} within 30 seconds.`)
  shutdown(1)
} else {
  console.log(`API server ready on http://localhost:${port}`)
  start('Vite', ['node_modules/vite/bin/vite.js'])
}

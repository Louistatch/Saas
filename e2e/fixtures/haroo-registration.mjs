// Local-only AgriTogo contract fixture. Never creates a real account or sends e-mail.
import http from 'node:http'

const port = 54377
let last = null
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    if (url.pathname === '/health') return send(200, { ok: true })
    if (url.pathname === '/last') return send(200, last)
    if (req.method !== 'POST' || url.pathname !== '/api/v1/haroo/auth/register')
      return send(404, {})
    let body = ''
    for await (const chunk of req) body += chunk
    const input = JSON.parse(body)
    last = { ...input, password: input.password ? '[provided]' : undefined }
    return send(201, {
      success: true,
      profile_type: input.profile_type,
      haroo_type: input.profile_type.toLowerCase(),
    })
  })
  .listen(port, '127.0.0.1')

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

export async function startGateway(probes) {
  const model = 'qa-model-' + randomUUID()
  const key = randomUUID()
  const calls = []
  const checked = new Set()
  let listed = false
  let rejected = false
  let failure
  function answer(response, content, tool) {
    const chunk = delta => ({
      id: 'chatcmpl-acceptance', object: 'chat.completion.chunk', created: 1, model,
      choices: [{ index: 0, delta, finish_reason: null }],
    })
    const first = chunk(tool
      ? { role: 'assistant', tool_calls: [{ index: 0, id: tool.id, type: 'function',
          function: { name: tool.name, arguments: JSON.stringify({ file_path: tool.file }) } }] }
      : { role: 'assistant', content })
    const last = chunk({})
    last.choices[0].finish_reason = tool ? 'tool_calls' : 'stop'
    last.usage = { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end([JSON.stringify(first), JSON.stringify(last), '[DONE]'].map(x => 'data: ' + x + '\n\n').join(''))
  }
  const server = createServer(async (req, res) => {
    try {
      assert(req.headers.authorization === 'Bearer ' + key, 'Unexpected test credential')
      if (req.method === 'GET' && req.url === '/v1/models') {
        listed = true
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ object: 'list', data: [{ id: model, object: 'model', owned_by: 'local-qa' }] }))
        return
      }
      assert.equal(req.url, '/v1/chat/completions')
      assert.equal(req.method, 'POST')
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      assert.equal(body.model, model, 'The wire model ID changed')
      const user = body.messages.filter(m => m.role === 'user').at(-1)
      const prompt = JSON.stringify(user?.content)
      if (prompt.includes('QA_FORCE_ERROR')) {
        rejected = true
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { type: 'authentication_error', message: 'qa-auth-rejected' } }))
        return
      }
      if (prompt.includes('QA_RESUME')) {
        const history = JSON.stringify(body.messages)
        assert(history.includes(probes[0].expected) && history.includes('QA_FIRST'), 'Conversation history was lost')
        checked.add('multi-turn')
        answer(res, 'RESUMED ' + probes[0].expected)
        return
      }
      assert(prompt.includes('QA_FIRST'))
      // Verify what the model actually receives back at the HTTP boundary.
      for (const result of body.messages.filter(m => m.role === 'tool')) {
        const probe = calls.find(c => c.id === result.tool_call_id)
        if (!probe || checked.has(probe.id)) continue
        const returned = JSON.stringify(result.content)
        if (probe.missing) assert.match(returned, /not found|no such|ENOENT|does not exist|cannot find|missing|error/i)
        else assert(returned.includes(probe.expected), 'Wrong tool output from ' + probe.file)
        checked.add(probe.id)
      }
      assert.equal(calls.length, [...checked].filter(k => k.startsWith('call_')).length,
        'A tool result is absent or its call identity changed')
      const next = probes[calls.length]
      if (!next) {
        answer(res, 'VERIFIED ' + probes[0].expected)
        return
      }
      const read = body.tools?.find(t => t.function?.name === 'read')
      assert(read, 'Installed native read tool is unavailable')
      const tool = { ...next, id: 'call_' + calls.length, name: read.function.name }
      calls.push(tool)
      answer(res, null, tool)
    } catch (err) {
      failure ??= err
      if (!res.headersSent) res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Local QA contract failed' } }))
    }
  })
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok) })
  return {
    baseURL: 'http://127.0.0.1:' + server.address().port + '/v1', key, model, calls,
    get listed() { return listed },
    get rejected() { return rejected },
    check() { if (failure) throw failure },
    finish() { this.check(); assert(checked.has('multi-turn')); assert.equal(calls.length, probes.length) },
    async close() { server.closeAllConnections(); await new Promise(ok => server.close(ok)) },
  }
}

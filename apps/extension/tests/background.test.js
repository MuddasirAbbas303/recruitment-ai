import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const backgroundScript = readFileSync(
  new URL('../background.js', import.meta.url),
  'utf8',
)

test('stores the session and focuses an existing Recruitment AI tab', async () => {
  const calls = {
    storage: [],
    tabUpdates: [],
    windowUpdates: [],
  }
  let messageListener
  const context = vm.createContext({
    URL,
    fetch: async () => ({
      ok: true,
      json: async () => ({
        success: true,
        importSessionId: 'session-123',
        results: [{ id: 'candidate-1' }],
      }),
    }),
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListener = listener
          },
        },
      },
      storage: {
        local: {
          async set(value) {
            calls.storage.push(value)
          },
        },
      },
      tabs: {
        async query() {
          return [{ id: 42, windowId: 7 }]
        },
        async update(id, update) {
          calls.tabUpdates.push({ id, update })
        },
        async create() {
          throw new Error('A new tab should not be created')
        },
      },
      windows: {
        async update(id, update) {
          calls.windowUpdates.push({ id, update })
        },
      },
    },
  })

  vm.runInContext(backgroundScript, context)
  const response = await new Promise((resolve) => {
    const keepsChannelOpen = messageListener(
      {
        type: 'IMPORT_CANDIDATES',
        candidates: [{ fullName: 'Example Candidate' }],
      },
      {},
      resolve,
    )

    assert.equal(keepsChannelOpen, true)
  })

  assert.equal(response.ok, true)
  assert.deepEqual(JSON.parse(JSON.stringify(calls.storage)), [
    { latestImportSessionId: 'session-123' },
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(calls.tabUpdates)), [
    {
      id: 42,
      update: {
        active: true,
        url: 'http://localhost:5173/?importSession=session-123',
      },
    },
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(calls.windowUpdates)), [
    { id: 7, update: { focused: true } },
  ])
})

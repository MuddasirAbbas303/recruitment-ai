import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoadingActionController } from './useLoadingActions.js'

test('prevents duplicate actions and keeps candidates independent', () => {
  const controller = createLoadingActionController()
  assert.equal(controller.begin('john:analyze'), true)
  assert.equal(controller.begin('john:analyze'), false)
  assert.equal(controller.begin('sarah:analyze'), true)
  assert.equal(controller.has('john:analyze'), true)
  assert.equal(controller.has('sarah:analyze'), true)
})

test('clears loading after success or failure cleanup', () => {
  const controller = createLoadingActionController()
  controller.begin('candidate:save')
  controller.end('candidate:save')
  assert.equal(controller.has('candidate:save'), false)

  controller.begin('candidate:enrich')
  controller.end('candidate:enrich')
  assert.equal(controller.has('candidate:enrich'), false)
})

test('publishes snapshots suitable for synchronized card and details state', () => {
  const snapshots = []
  const controller = createLoadingActionController((active) => snapshots.push([...active]))
  controller.begin('candidate:project-analysis')
  controller.end('candidate:project-analysis')
  assert.deepEqual(snapshots, [['candidate:project-analysis'], []])
})

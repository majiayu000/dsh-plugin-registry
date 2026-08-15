import assert from 'node:assert/strict'
import test from 'node:test'
import { hasDshCandidateContext } from '../assets/candidate-relevance.js'

test('candidate relevance requires a DSH signal beyond the discovery topic', () => {
  assert.equal(hasDshCandidateContext({
    id: 'PicGo/PicGo-Core',
    description: ':zap:The ultimate image uploading engine.',
    topics: ['picture-upload', 'dsh-plugin'],
  }), false)
  assert.equal(hasDshCandidateContext({
    id: 'acme/dsh-vision',
    description: '',
    topics: ['dsh-plugin'],
  }), true)
  assert.equal(hasDshCandidateContext({
    id: 'acme/vision-toolkit',
    description: 'Vision tools for DeepSeek Harness.',
    topics: ['dsh-plugin'],
  }), true)
  assert.equal(hasDshCandidateContext({
    id: 'acme/general-skill',
    description: 'A general-purpose agent skill.',
    topics: ['dsh-plugin', 'deepseek-harness'],
  }), true)
  assert.equal(hasDshCandidateContext({
    id: 'acme/plugin-with-missing-patch',
    description: '',
    topics: ['dsh-plugin'],
    verification: { manifest: 'shape_validated', patch: 'missing' },
  }), true)
})

// Covers: which commands commit, how a message is read from each form the
// transcripts hold, the three checks of the Commits doctrine, and the split
// of commits by what their session was told.
// Deliberately not covered: a message passed by file (-F) or an editor —
// unreadable from the command, counted apart, never guessed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runsCommit, commitMessages, commitViolations, byReminder } from './commits.js'

test('only a segment that runs git commit is a commit', () => {
  assert.ok(runsCommit('cd /x && git add -A && git commit -q -m "fix it" && git push'))
  assert.ok(runsCommit('git -C /x commit -m "fix it"'))
  assert.ok(!runsCommit("python3 - <<'EOF'\nprint('git commit -m later')\nEOF"), 'a heredoc mentioning a commit counted as one')
  assert.ok(!runsCommit('grep -n "git commit" README.md'), 'a search for the words counted as a commit')
  assert.ok(!runsCommit("cat > notes.md <<'EOF'\nfirst … && git commit -m b\nEOF"), 'a heredoc body split at && counted as a commit')
  assert.ok(runsCommit("cat > notes.md <<'EOF'\ntext\nEOF\ngit add -A && git commit -qm \"after the heredoc\""), 'a commit after a heredoc was lost')
})

test('a message is read from -m, from several -m, from a flag group, and from the heredoc form', () => {
  assert.deepEqual(commitMessages('git commit -q -m "fix the safari stutter"'), ['fix the safari stutter'])
  assert.deepEqual(commitMessages("git commit -m 'fix it'"), ['fix it'])
  assert.deepEqual(commitMessages('git commit -m "subject" -m "body"'), ['subject\n\nbody'])
  assert.deepEqual(commitMessages("git commit -m \"$(cat <<'EOF'\nfeat: add it\n\nbody\nEOF\n)\""), ['feat: add it\n\nbody'])
  assert.deepEqual(commitMessages('git commit -qm "fold the flags"'), ['fold the flags'], 'a message in a flag group was missed')
  assert.deepEqual(commitMessages('git commit -q -am "fix the typo"'), ['fix the typo'])
  assert.deepEqual(commitMessages('git commit --message="spelled out"'), ['spelled out'])
  assert.deepEqual(commitMessages('git commit -F msg.txt'), [null], 'an unreadable message was guessed')
})

test('two commits in one command are two messages, not one message of two lines', () => {
  assert.deepEqual(commitMessages('git commit -qm "first" && git add x && git commit -qm "second"'), ['first', 'second'])
})

test('the three Commits checks name what broke', () => {
  assert.deepEqual(commitViolations('fix the safari stutter'), [])
  assert.deepEqual(commitViolations('feat(ui): Add it'), ['conventional commits prefix'])
  assert.deepEqual(commitViolations('Fix it'), ['not lowercase'])
  assert.deepEqual(commitViolations('fix it\n\nCo-Authored-By: x'), ['more than one line'])
})

test('commits split by whether their session was reminded, held out, or neither', () => {
  const c = (sessionId, violations = []) => ({ sessionId, violations })
  const records = [
    { label: 'injected', sessionId: 'G', given: ['CLAUDE.md#Commits'], held: [] },
    { label: 'injected', sessionId: 'H', given: [], held: ['CLAUDE.md#Commits'] }
  ]
  const groups = byReminder([c('G'), c('H'), c('N'), { sessionId: 'G', violations: null }], records)
  assert.deepEqual([groups.given.length, groups.held.length, groups.none.length], [1, 1, 1],
    'an unreadable message was counted, or a commit landed in the wrong group')
})

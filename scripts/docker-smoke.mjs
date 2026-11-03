import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';

const args = process.argv.slice(2).filter(arg => arg !== '--');
assert(args.length <= 1, 'Usage: pnpm test:docker [image]');
const image = args[0] ?? 'rv-catalog:smoke';
const resource = `rv-catalog-smoke-${randomUUID()}`;
const container = `${resource}-app`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const args of [['rm', '--force', container], ['volume', 'rm', resource]]) {
    try { docker(...args); } catch { /* A failed startup might not have created both resources. */ }
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { cleanup(); process.exit(1); });
}

try {
  docker('info');
  if (!args[0]) execFileSync('docker', ['build', '--tag', image, '.'], { stdio: 'inherit' });
  docker('volume', 'create', resource);
  docker('run', '--detach', '--init', '--name', container, '--mount', `type=volume,src=${resource},dst=/app/data`, '--publish', '127.0.0.1::3001', image);
  assert.notEqual(docker('exec', container, 'id', '-u'), '0', 'Runtime must be nonroot');
  let origin;
  async function request(path, options) {
    const response = await fetch(`${origin}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, `${path} should return HTTP 200`);
    return response;
  }
  async function ready() {
    for (let attempt = 0; attempt < 60; attempt++) {
      const [state] = JSON.parse(docker('inspect', container));
      assert.equal(state.State.Running, true, 'Container must stay running');
      if (state.State.Health.Status === 'healthy') {
        origin = `http://127.0.0.1:${state.NetworkSettings.Ports['3001/tcp'][0].HostPort}`;
        assert.equal((await (await request('/api/health')).json()).status, 'ok');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Container did not become healthy within 60 seconds');
  }
  const catalog = async () => (await request('/api/catalog')).json();
  async function command(action) {
    const { revision } = await catalog();
    return (await request('/api/catalog/commands', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, expectedRevision: revision }),
    })).json();
  }
  async function verifyImage(path) {
    const response = await request(path);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.length > 12, 'Stored image must contain bytes');
    assert.equal(Number(response.headers.get('content-length')), bytes.length);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), path.split('/').at(-1));
  }
  await ready();
  assert.equal((await catalog()).catalog.products.length, 0, 'Startup must migrate an empty database without seeding');
  assert.match(await (await request('/')).text(), /<html/);
  docker('exec', container, 'node', '--import', 'tsx', 'server/seed.ts');
  const seeded = (await catalog()).catalog.products;
  assert.equal(seeded.length, 43);
  assert.equal(seeded.filter(product => product.included).length, 14);
  for (const path of new Set(seeded.map(product => product.image))) await verifyImage(path);
  const edited = seeded[0];
  const removed = seeded[1];
  await command({ kind: 'set-included', id: edited.id, included: !edited.included });
  await command({ kind: 'remove', id: removed.id });
  const before = await catalog();
  docker('stop', '--time', '10', container);
  const [stopped] = JSON.parse(docker('inspect', container));
  assert.equal(stopped.State.ExitCode, 0, 'SIGTERM must shut down gracefully');
  docker('start', container);
  await ready();
  assert.deepEqual(await catalog(), before, 'Restart must preserve edits and must not seed deleted products');
  await verifyImage(edited.image);
  docker('rm', '--force', container);
  docker('run', '--detach', '--init', '--name', container, '--mount', `type=volume,src=${resource},dst=/app/data`, '--publish', '127.0.0.1::3001', image);
  await ready();
  assert.deepEqual(await catalog(), before, 'Replacement container must reuse the persisted database and images');
  await verifyImage(edited.image);
  console.log('Docker smoke passed. Migrations, explicit seed, image bytes, edits, deletion, restart, volume reuse, and SIGTERM verified.');
} catch (error) {
  try { execFileSync('docker', ['logs', container], { stdio: 'inherit' }); } catch { /* Startup can fail before a container exists. */ }
  throw error;
} finally {
  cleanup();
}

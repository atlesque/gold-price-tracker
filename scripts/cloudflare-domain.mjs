import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
const account = 'df08931372f873bc0c8edb7679dc0cf4';
const project = 'atlesque-gold';
const domain = 'gold.atlesque.dev';
const token = process.env.CLOUDFLARE_API_TOKEN || (await readFile(`${homedir()}/Library/Preferences/.wrangler/config/default.toml`, 'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!token) throw new Error('Cloudflare authentication unavailable. Run wrangler login.');
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!data.success) throw new Error(`Cloudflare ${response.status}: ${JSON.stringify(data.errors)}`);
  return data.result;
}
const action = process.argv[2] || 'status';
if (action === 'inspect') {
  const zones = await api('/zones?name=atlesque.dev');
  console.log(JSON.stringify({ zones: zones.map(z => ({ id: z.id, name: z.name, status: z.status, account: z.account.id })) }));
  if (zones[0]) {
    const records = await api(`/zones/${zones[0].id}/dns_records?name=${domain}`);
    console.log(JSON.stringify({ records: records.map(r => ({ id: r.id, name: r.name, type: r.type, content: r.content, proxied: r.proxied })) }));
  }
} else if (action === 'attach') {
  console.log(JSON.stringify(await api(`/accounts/${account}/pages/projects/${project}/domains`, 'POST', { name: domain })));
} else if (action === 'dns') {
  const zones = await api('/zones?name=atlesque.dev');
  if (!zones[0] || zones[0].account.id !== account) throw new Error('Expected zone not found in the deployment account');
  const records = await api(`/zones/${zones[0].id}/dns_records?name=${domain}`);
  if (records.length) {
    if (!records.some(r => r.type === 'CNAME' && r.content === `${project}.pages.dev`)) throw new Error('Existing DNS record differs. Refusing to overwrite it.');
    console.log('The expected CNAME already exists.');
  } else {
    const record = await api(`/zones/${zones[0].id}/dns_records`, 'POST', { type: 'CNAME', name: domain, content: `${project}.pages.dev`, proxied: true, ttl: 1 });
    console.log(JSON.stringify({ name: record.name, type: record.type, content: record.content }));
  }
} else if (action === 'status') {
  console.log(JSON.stringify(await api(`/accounts/${account}/pages/projects/${project}/domains`)));
} else throw new Error('Expected inspect, attach, dns, or status');

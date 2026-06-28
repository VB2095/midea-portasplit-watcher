// Capture TOUT le trafic kingfisher/api de la fiche produit Castorama.
import { chromium } from 'playwright';

const URL =
  'https://www.castorama.fr/climatiseur-portasplit-midea-reversible-3500w/8431312260509_CAFR.prd';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: 'fr-FR',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  extraHTTPHeaders: { 'Accept-Language': 'fr-FR,fr;q=0.9' },
});
const page = await ctx.newPage();

const reqs = [];
page.on('request', (req) => {
  const u = req.url();
  if (/kingfisher\.com|\/api\/|graphql|stock|availab|offer|fulfil|store/i.test(u)) {
    reqs.push({
      method: req.method(),
      url: u,
      headers: req.headers(),
      post: req.postData() || null,
    });
  }
});

const responses = {};
page.on('response', async (res) => {
  const u = res.url();
  if (/kingfisher\.com|\/api\//i.test(u)) {
    try {
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('json')) {
        const t = await res.text();
        responses[u] = { status: res.status(), body: t.slice(0, 1500) };
      }
    } catch {}
  }
});

for (let attempt = 0; attempt < 3; attempt++) {
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    break;
  } catch (e) {
    console.error('goto retry', attempt, e.message);
    await page.waitForTimeout(3000);
  }
}
await page.waitForTimeout(8000);

console.log('\n===== REQUESTS (kingfisher/api/stock/store) =====');
for (const r of reqs) {
  console.log(`\n[${r.method}] ${r.url}`);
  // headers d'auth importants
  for (const k of ['authorization', 'apikey', 'apikey', 'x-api-key', 'atmosphere']) {
    if (r.headers[k]) console.log(`   ${k}: ${r.headers[k]}`);
  }
  const auth = r.headers['authorization'];
  if (auth) console.log(`   authorization: ${auth}`);
  const apik = r.headers['apikey'];
  if (apik) console.log(`   apikey: ${apik}`);
  if (r.post) console.log(`   POST: ${r.post.slice(0, 400)}`);
}

console.log('\n\n===== RESPONSES (json bodies) =====');
for (const [u, v] of Object.entries(responses)) {
  console.log(`\n[${v.status}] ${u}\n${v.body}`);
}

await browser.close();

import './style.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import type { PriceResult } from '../shared/quote';
const el = (id: string) => document.getElementById(id)!;
const numberFormat = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const copyButton = el('copy-price') as HTMLButtonElement;
const quotePanel = el('quote-panel');
let result: PriceResult | null = null;
let refreshAt = 0, clockOffset = 0, timer: ReturnType<typeof setTimeout> | null = null, fetching = false;
let copying = false, feedbackTimer: ReturnType<typeof setTimeout> | null = null;
function resetCopyFeedback() {
  if (feedbackTimer) clearTimeout(feedbackTimer);
  quotePanel.classList.remove('copy-feedback');
  el('copy-hint').textContent = 'Copy price';
  el('copy-status').textContent = '';
}
copyButton.addEventListener('click', async () => {
  if (!result?.quote || copying) return;
  copying = true;
  resetCopyFeedback();
  try {
    await navigator.clipboard.writeText(numberFormat.format(result.quote.price));
    el('copy-hint').textContent = 'Copied!';
    el('copy-status').textContent = 'Euro price copied to clipboard.';
  } catch {
    el('copy-hint').textContent = 'Couldn’t copy. Try again.';
    el('copy-status').textContent = 'Could not copy the price. Please try again.';
  } finally {
    copying = false;
    quotePanel.classList.add('copy-feedback');
    feedbackTimer = setTimeout(resetCopyFeedback, 2500);
  }
});
void import('./scene').then(({ initGoldScene }) => initGoldScene(el('gold-scene'))).catch(() => {
  el('gold-scene').innerHTML = '<div class="scene-fallback" aria-hidden="true">Au</div>';
});
function render(data: PriceResult) {
  result = data;
  resetCopyFeedback();
  copyButton.disabled = !data.quote;
  quotePanel.classList.toggle('has-price', !!data.quote);
  copyButton.setAttribute('aria-label', data.quote ? `Copy ${numberFormat.format(data.quote.price)} euros per kilogram` : 'Gold price unavailable');
  el('price').textContent = data.quote ? numberFormat.format(data.quote.price) : '—';
  clockOffset = Date.parse(data.serverTime) - Date.now();
  refreshAt = Date.parse(data.nextRefreshAt);
  const closed = data.market === 'closed';
  el('market-status').classList.toggle('open', !closed && !data.stale && !!data.quote);
  el('market-status').classList.toggle('delayed', data.stale || data.unavailable);
  el('market-label').textContent = data.unavailable ? 'Unavailable' : data.stale ? 'Delayed quote' : closed ? 'Market closed' : 'Market open';
  el('quote-note').textContent = data.unavailable ? 'The price is temporarily unavailable. Retrying in one minute.'
    : data.stale ? 'Showing the last available quote. Retrying in one minute.'
    : closed ? 'Market closed. Showing the last available gold price in euros per kilogram.'
    : 'Current gold price in euros per kilogram.';
  if (data.quote) {
    const retrieved = new Date(data.quote.fetchedAt).toLocaleString('en-GB', { timeZone: 'Europe/Brussels' });
    el('market-status').title = `${data.quote.sourceName} · retrieved ${retrieved} Brussels`;
    el('quote-note').textContent += ` Source: ${data.quote.sourceName}. Retrieved ${retrieved} Brussels.`;
    if (closed) el('market-status').title += ` · reopens ${new Date(refreshAt).toLocaleString('en-GB', { timeZone: 'Europe/Brussels' })} Brussels`;
  }
}
function schedule() {
  if (timer) clearTimeout(timer);
  if (document.hidden) return;
  timer = setTimeout(() => { void loadPrice(); }, Math.max(1000, Math.min(2_147_000_000, refreshAt - Date.now() - clockOffset + 300)));
}
async function loadPrice() {
  if (fetching || document.hidden) return;
  fetching = true;
  quotePanel.classList.add('loading');
  quotePanel.setAttribute('aria-busy', 'true');
  el('loading-status').textContent = result?.quote ? 'Refreshing gold price.' : 'Fetching gold price.';
  try {
    const response = await fetch('/api/price', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('nextRefreshAt' in data) || !('serverTime' in data) || !('quote' in data)) throw new Error('Price unavailable');
    render(data as PriceResult);
  } catch {
    refreshAt = Date.now() + clockOffset + 60_000;
    el('market-status').classList.remove('open');
    el('market-status').classList.add('delayed');
    el('market-label').textContent = result?.quote ? 'Delayed quote' : 'Unavailable';
    el('quote-note').textContent = result?.quote ? 'Showing the last available gold price in euros per kilogram. Reconnecting shortly.' : 'The gold price is temporarily unavailable. Reconnecting shortly.';
  } finally {
    fetching = false;
    quotePanel.classList.remove('loading');
    quotePanel.setAttribute('aria-busy', 'false');
    el('loading-status').textContent = '';
    schedule();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (timer) clearTimeout(timer); }
  else if (Date.now() + clockOffset >= refreshAt) void loadPrice();
  else schedule();
});
void loadPrice();

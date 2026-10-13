const elements = Object.fromEntries([
  'sidebar-dot', 'sidebar-status', 'metric-connection', 'metric-subscriptions',
  'metric-trades', 'metric-candidates', 'metric-last', 'metric-queue',
  'trades-body', 'candidate-list', 'candidate-badge', 'search', 'venue',
  'max-slots', 'save-settings', 'setting-feedback', 'error-text', 'stream-label', 'stream-chip',
].map(id => [id, document.getElementById(id)]));

let snapshot = null;
let streamConnected = false;
const short = value => value ? `${value.slice(0, 5)}…${value.slice(-5)}` : '—';
const time = value => value ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(value) : '—';
const relative = value => {
  if (!value) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
};
const amount = (raw, decimals) => {
  const value = Number(raw) / (10 ** decimals);
  return Number.isFinite(value) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, notation: value >= 1000000 ? 'compact' : 'standard' }).format(value) : '—';
};
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function explorerLink(signature, label) {
  const link = el('a', '', label);
  link.href = `https://solscan.io/tx/${encodeURIComponent(signature)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}
function renderTrades() {
  const query = elements.search.value.trim().toLowerCase();
  const venue = elements.venue.value;
  const trades = (snapshot?.trades ?? []).filter(item =>
    (venue === 'all' || item.venue === venue) &&
    (!query || item.mint.toLowerCase().includes(query) || item.owner.toLowerCase().includes(query))
  ).slice(0, 40);
  elements['trades-body'].replaceChildren();
  if (!trades.length) {
    const row = el('tr');
    const cell = el('td', 'empty', snapshot?.trades?.length ? 'No trades match these filters.' : 'Waiting for confirmed swaps…');
    cell.colSpan = 5;
    row.append(cell);
    elements['trades-body'].append(row);
    return;
  }
  for (const trade of trades) {
    const row = el('tr');
    const type = el('td');
    type.append(el('span', `side-badge ${trade.side}`, trade.side.toUpperCase()), el('small', 'venue-name', trade.venue));
    const token = el('td');
    token.append(explorerLink(trade.signature, short(trade.mint)), el('small', 'wallet', short(trade.owner)));
    row.append(type, token, el('td', 'number', amount(trade.tokenAmount, trade.decimals)), el('td', 'mono', String(trade.slot)), el('td', 'muted', time(trade.time)));
    elements['trades-body'].append(row);
  }
}
function renderCandidates() {
  elements['candidate-list'].replaceChildren();
  const candidates = (snapshot?.candidates ?? []).slice(0, 8);
  if (!candidates.length) {
    elements['candidate-list'].append(el('div', 'empty-card', 'Watching for cross-slot sequences.'));
    return;
  }
  for (const item of candidates) {
    const card = el('div', 'candidate');
    const heading = el('div', 'candidate-heading');
    heading.append(el('strong', '', short(item.mint)), el('span', '', `${item.slots} slots`));
    const meta = el('div', 'candidate-meta', `${item.venue} · ${item.direction.toUpperCase()} sequence · ${time(item.time)}`);
    const sequence = el('div', 'sequence');
    for (const [label, leg] of [['FRONT', item.front], ['MIDDLE', item.middle], ['BACK', item.back]]) {
      const part = el('div');
      part.append(el('small', '', label), explorerLink(leg.signature, short(leg.signature)));
      sequence.append(part);
    }
    card.append(heading, meta, sequence);
    elements['candidate-list'].append(card);
  }
}
function render() {
  if (!snapshot) return;
  const connected = streamConnected && snapshot.connection === 'live' && !snapshot.error && snapshot.dropped === 0;
  elements['sidebar-dot'].classList.toggle('on', connected);
  const degraded = Boolean(snapshot.error || snapshot.dropped);
  elements['sidebar-status'].textContent = connected ? 'Streaming confirmed data' : degraded ? 'Coverage degraded' : snapshot.connection;
  elements['metric-connection'].textContent = connected ? 'Live' : degraded ? 'Degraded' : snapshot.connection;
  elements['stream-label'].textContent = connected ? 'LIVE' : degraded ? 'DEGRADED' : 'CONNECTING';
  elements['stream-chip'].classList.toggle('degraded', !connected);
  elements['metric-subscriptions'].textContent = `${snapshot.subscriptions} / 2 subscriptions`;
  elements['metric-trades'].textContent = snapshot.totalTrades.toLocaleString();
  elements['metric-candidates'].textContent = snapshot.totalCandidates.toLocaleString();
  elements['candidate-badge'].textContent = snapshot.totalCandidates;
  elements['metric-last'].textContent = relative(snapshot.lastTradeAt);
  elements['metric-queue'].textContent = `Queue: ${snapshot.queueLength} · Dropped: ${snapshot.dropped}`;
  elements['error-text'].textContent = snapshot.error ?? 'No scanner errors';
  if (document.activeElement !== elements['max-slots']) elements['max-slots'].value = snapshot.maxSlots;
  renderTrades();
  renderCandidates();
}

elements.search.addEventListener('input', renderTrades);
elements.venue.addEventListener('change', renderTrades);
elements['save-settings'].addEventListener('click', async () => {
  elements['setting-feedback'].textContent = 'Saving…';
  try {
    const response = await fetch('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maxSlots: Number(elements['max-slots'].value) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    elements['setting-feedback'].textContent = `Watching up to ${result.maxSlots} slots.`;
  } catch (error) {
    elements['setting-feedback'].textContent = error.message;
  }
});

const stream = new EventSource('/api/stream');
stream.onopen = () => { streamConnected = true; render(); };
stream.onerror = () => { streamConnected = false; render(); };
stream.onmessage = event => { snapshot = JSON.parse(event.data); render(); };
setInterval(() => { if (snapshot) elements['metric-last'].textContent = relative(snapshot.lastTradeAt); }, 1000);


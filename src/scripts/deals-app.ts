// @ts-nocheck

const DATA_BASE = (document.querySelector('meta[name="site-base"]')?.content || '/').replace(/\/$/, '');

let allDeals = [];
let historyData = {};
let expiredDeals = [];
let statusFilter = 'active';
let offerFilter = '';
let categoryFilter = '';
let activityFilter = '';
let provinceFilter = '';
let geoFilter = '';
let dateFilter = '';
let changeFilter = '';
let sortCol = 'end_ts';
let sortAsc = true;
let map = null;
let markers = [];
let currentView = 'table';

const VALID_VIEWS = new Set(['table', 'map', 'split']);

function dataPathForDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${DATA_BASE}/data/${year}/${month}/${day}.json`;
}

function getSlug(url) {
  try {
    const parts = new URL(url).pathname.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get('q') || '',
    date: params.get('date') || '',
    location: params.get('location') || '',
    status: params.get('status') || 'active',
    offer: params.get('offer') || params.get('type') || '',
    category: params.get('category') || '',
    activity: params.get('activity') || '',
    province: params.get('province') || '',
    geo: params.get('geo') || '',
    dateStatus: params.get('dateStatus') || '',
    change: params.get('change') || '',
    view: params.get('view') || 'table',
  };
}

function updateUrlState() {
  const picker = document.getElementById('date-picker');
  const searchBox = document.getElementById('search-box');
  const locationFilter = document.getElementById('location-filter');
  const params = new URLSearchParams();
  if (searchBox.value.trim()) params.set('q', searchBox.value.trim());
  if (picker.value && picker.selectedIndex > 0) params.set('date', picker.value);
  if (locationFilter.value) params.set('location', locationFilter.value);
  if (statusFilter !== 'active') params.set('status', statusFilter);
  if (offerFilter) params.set('offer', offerFilter);
  if (categoryFilter) params.set('category', categoryFilter);
  if (activityFilter) params.set('activity', activityFilter);
  if (provinceFilter) params.set('province', provinceFilter);
  if (geoFilter) params.set('geo', geoFilter);
  if (dateFilter) params.set('dateStatus', dateFilter);
  if (changeFilter) params.set('change', changeFilter);
  if (currentView !== 'table') params.set('view', currentView);
  const query = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
}

async function loadInitial() {
  try {
    const initialUrlState = readUrlState();
    const [indexRes, histRes] = await Promise.all([
      fetch(DATA_BASE + '/data/index.json'),
      fetch(DATA_BASE + '/data/history.json').catch(() => null),
    ]);
    const dates = await indexRes.json();
    if (histRes && histRes.ok) historyData = await histRes.json();

    const picker = document.getElementById('date-picker');
    dates.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      if (initialUrlState.date ? d === initialUrlState.date : i === 0) opt.selected = true;
      picker.appendChild(opt);
    });
    picker.addEventListener('change', () => loadDate(picker.value, readUrlState()));
    if (dates.length) loadDate(picker.value || dates[0], initialUrlState);
    else document.getElementById('loading').textContent = 'Geen data beschikbaar.';
  } catch (e) {
    document.getElementById('loading').textContent = 'Fout bij laden van data.';
    console.error(e);
  }
}

async function loadDate(dateStr, state = readUrlState()) {
  document.getElementById('loading').style.display = 'block';
  try {
    const res = await fetch(dataPathForDate(dateStr));
    allDeals = await res.json();
    allDeals.forEach(d => {
      const h = historyData[d.url];
      d._history = h || null;
      d._trend = h?.trend || 'new';
      d._changes = h?.changes || [];
      d._daysTracked = h?.days_tracked || 1;
      d._changeCount = h?.change_count || 0;
    });

    const activeUrls = new Set(allDeals.map(d => d.url));
    expiredDeals = Object.entries(historyData)
      .filter(([url]) => !activeUrls.has(url))
      .map(([url, h]) => ({
        url,
        name: h.name || url,
        label: h.label || '',
        offers: h.offers || [],
        offer_enums: h.offer_enums || [],
        categories: h.categories || [],
        types: h.types || [],
        location: h.location || '',
        provider: h.provider || '',
        description: h.description || '',
        start_date: h.start_date || '',
        end_date: h.end_date || '',
        last_updated: h.last_updated || '',
        locations: h.locations || [],
        lat: h.lat ?? null,
        lng: h.lng ?? null,
        image_url: h.image_url || '',
        is_winactie: !!h.is_winactie,
        _expired: true,
        _history: h,
        _trend: h.trend || 'stable',
        _changes: h.changes || [],
        _daysTracked: h.days_tracked || 1,
        _changeCount: h.change_count || 0,
      }));

    document.getElementById('search-box').value = state.q || '';
    statusFilter = ['active', 'all', 'expired'].includes(state.status) ? state.status : 'active';
    offerFilter = state.offer || '';
    categoryFilter = state.category || '';
    activityFilter = state.activity || '';
    provinceFilter = state.province || '';
    geoFilter = state.geo || '';
    dateFilter = state.dateStatus || '';
    changeFilter = state.change || '';
    document.getElementById('status-filter').value = statusFilter;
    document.getElementById('offer-filter').value = offerFilter;
    document.getElementById('geo-filter').value = geoFilter;
    document.getElementById('date-filter').value = dateFilter;
    document.getElementById('change-filter').value = changeFilter;
    populateFacetFilters(state);
    renderAll();
    showView(VALID_VIEWS.has(state.view) ? state.view : 'table');
  } catch (e) {
    document.getElementById('loading').textContent = 'Fout bij laden van aanbiedingen.';
    console.error(e);
  }
}

function populateSelect(id, defaultLabel, values, selected = '') {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">${esc(defaultLabel)}</option>`;
  values.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = l;
    sel.appendChild(opt);
  });
  sel.value = values.includes(selected) ? selected : '';
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'));
}

function populateFacetFilters(state = {}) {
  populateSelect('location-filter', 'Alle plaatsen', uniqueSorted(allDeals.map(d => d.location)), state.location || '');
  populateSelect('category-filter', 'Alle categorieen', uniqueSorted(allDeals.flatMap(d => d.categories || [])), state.category || '');
  populateSelect('activity-filter', 'Alle activiteitstypes', uniqueSorted(allDeals.flatMap(d => d.types || [])), state.activity || '');
  populateSelect('province-filter', 'Alle provincies', uniqueSorted(allDeals.flatMap(d => getLocations(d).map(l => l.province))), state.province || '');
}

function getPool() {
  if (statusFilter === 'expired') return expiredDeals;
  if (statusFilter === 'all') return [...allDeals, ...expiredDeals];
  return allDeals;
}

function offerKind(d) {
  const hay = `${d.label || ''} ${(d.offers || []).join(' ')} ${(d.offer_enums || []).join(' ')}`.toLowerCase();
  if (d.is_winactie || hay.includes('chance') || hay.includes('kans op') || hay.includes('winactie')) return 'winactie';
  if (hay.includes('free_for_two') || hay.includes('2 personen gratis')) return 'twee-gratis';
  if (hay.includes('exclusive') || hay.includes('exclusief')) return 'exclusief';
  if (hay.includes('gratis') || hay.includes('free')) return 'gratis';
  if (hay.includes('korting') || hay.includes('discount')) return 'korting';
  return 'overig';
}

function hasProvince(d, province) {
  return getLocations(d).some(loc => loc.province === province);
}

function dateStatus(d) {
  if (!d.end_date && !d.end_ts) return 'no-end';
  const value = d.end_ts ? new Date(d.end_ts * 1000) : new Date(String(d.end_date).replace(' ', 'T'));
  if (Number.isNaN(value.getTime())) return 'unknown';
  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (value < now) return 'expired-date';
  if (value <= inSevenDays) return 'ending-7';
  if (value <= inThirtyDays) return 'ending-30';
  return 'later';
}

function getFiltered(forMap = false) {
  const q = document.getElementById('search-box').value.toLowerCase();
  const loc = document.getElementById('location-filter').value;
  let deals = getPool().filter(d => {
    if (loc && d.location !== loc) return false;
    if (offerFilter && offerKind(d) !== offerFilter) return false;
    if (categoryFilter && !(d.categories || []).includes(categoryFilter)) return false;
    if (activityFilter && !(d.types || []).includes(activityFilter)) return false;
    if (provinceFilter && !hasProvince(d, provinceFilter)) return false;
    if (geoFilter === 'mapped' && getLocations(d).length === 0) return false;
    if (geoFilter === 'unmapped' && getLocations(d).length > 0) return false;
    if (geoFilter === 'multi' && getLocations(d).length <= 1) return false;
    if (dateFilter && dateStatus(d) !== dateFilter) return false;
    if (changeFilter === 'new' && d._trend !== 'new') return false;
    if (changeFilter === 'changed' && d._trend !== 'changed') return false;
    if (changeFilter === 'stable' && d._trend !== 'stable') return false;
    const hay = [d.name, d.location, d.provider, d.label, d.description, ...(d.categories || []), ...(d.types || [])].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });

  if (currentView === 'split' && map && forMap === false) {
    const bounds = map.getBounds();
    deals = deals.filter(d => getLocations(d).some(l => l.lat != null && l.lng != null && bounds.contains([l.lat, l.lng])));
  }
  return deals;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeUrl(url) {
  if (!url) return '#';
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) ? esc(u.toString()) : '#';
  } catch {
    return '#';
  }
}

function fmtDate(value) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderStats() {
  const active = getFiltered().filter(d => !d._expired);
  const winacties = active.filter(d => offerKind(d) === 'winactie').length;
  const gratis = active.filter(d => offerKind(d) === 'gratis').length;
  const korting = active.filter(d => offerKind(d) === 'korting').length;
  const changed = active.filter(d => d._trend === 'changed').length;
  const mapped = active.filter(d => getLocations(d).length > 0).length;
  document.getElementById('stats-bar').innerHTML = `
    <div class="stat"><span class="stat-label">Aanbiedingen</span><span class="stat-value accent">${active.length}</span></div>
    <div class="stat"><span class="stat-label">Winacties</span><span class="stat-value">${winacties}</span></div>
    <div class="stat"><span class="stat-label">Gratis</span><span class="stat-value">${gratis}</span></div>
    <div class="stat"><span class="stat-label">Korting</span><span class="stat-value">${korting}</span></div>
    <div class="stat"><span class="stat-label">Gewijzigd</span><span class="stat-value">${changed}</span></div>
    <div class="stat"><span class="stat-label">Op kaart</span><span class="stat-value">${mapped}</span></div>
  `;
}

function renderTable() {
  const deals = getFiltered();
  deals.sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (sortCol === 'kind') { va = offerKind(a); vb = offerKind(b); }
    if (va == null || va === '') va = sortAsc ? 'zzzz' : '';
    if (vb == null || vb === '') vb = sortAsc ? 'zzzz' : '';
    if (typeof va === 'string') { va = va.toLowerCase(); vb = String(vb || '').toLowerCase(); }
    return sortAsc ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
  });

  document.getElementById('deals-body').innerHTML = deals.map(d => {
    const slug = getSlug(d.url);
    const detailHref = slug ? esc(DATA_BASE + '/deal/' + slug + '/') : safeUrl(d.url);
    const expiredBadge = d._expired ? ' <span class="expired-badge">VERLOPEN</span>' : '';
    const trend = d._trend === 'new' ? 'Nieuw' : d._trend === 'changed' ? 'Gewijzigd' : 'Stabiel';
    return `<tr class="${d._expired ? 'deal-expired' : ''}">
      <td><a href="${detailHref}">${esc(d.name)}</a>${expiredBadge}</td>
      <td><span class="discount-badge">${esc(d.label || offerKind(d))}</span></td>
      <td>${esc(d.location || '')}</td>
      <td class="col-extra">${esc(d.provider || '')}</td>
      <td>${esc(fmtDate(d.end_date))}</td>
      <td class="col-extra">${esc((d.categories || []).slice(0, 2).join(', '))}</td>
      <td class="col-extra">${trend}</td>
    </tr>`;
  }).join('');
  document.getElementById('loading').style.display = 'none';
}

function getLocations(d) {
  const normalize = (loc) => {
    const lat = Number(loc?.lat ?? loc?.latitude);
    const lng = Number(loc?.lng ?? loc?.lon ?? loc?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { ...loc, lat, lng };
  };
  if (Array.isArray(d.locations) && d.locations.length) return d.locations.map(normalize).filter(Boolean);
  const fallback = normalize({ lat: d.lat, lng: d.lng, address: d.address || d.location || '' });
  if (fallback) return [fallback];
  return [];
}

function renderAll() {
  renderStats();
  renderTable();
  if (map) renderMap(false);
  updateUrlState();
}

function showView(view) {
  currentView = view;
  ['table', 'map', 'split'].forEach(v => {
    const btn = document.getElementById('btn-' + v);
    btn.classList.toggle('active', view === v);
    btn.setAttribute('aria-selected', view === v ? 'true' : 'false');
  });
  document.body.classList.toggle('view-split', view === 'split');
  document.body.classList.toggle('view-map', view === 'map');

  const tableContainer = document.getElementById('table-container');
  const mapContainer = document.getElementById('map-container');
  tableContainer.style.display = view === 'table' || view === 'split' ? 'block' : 'none';
  mapContainer.style.display = view === 'map' || view === 'split' ? 'block' : 'none';
  updateUrlState();

  if (view === 'map' || view === 'split') {
    const isNew = !map;
    loadLeaflet().then(() => {
      if (!map) {
        map = window.L.map('map-container').setView([52.1, 5.3], 7);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        map.on('moveend zoomend', () => { if (currentView === 'split') renderAll(); });
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
        renderMap(isNew);
      }));
    });
  } else {
    renderAll();
  }
}

function coordKey(lat, lng) {
  return Number(lat).toFixed(5) + ',' + Number(lng).toFixed(5);
}

function renderMap(fitBounds = true) {
  if (!map) return;
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  const groups = {};
  getFiltered(true).forEach(d => {
    getLocations(d).forEach(loc => {
      if (loc.lat == null || loc.lng == null) return;
      const key = coordKey(loc.lat, loc.lng);
      if (!groups[key]) groups[key] = { lat: loc.lat, lng: loc.lng, address: loc.address || loc.name || d.location || '', items: [] };
      groups[key].items.push(d);
    });
  });

  Object.values(groups).forEach(g => {
    const list = g.items.slice(0, 8).map(d => {
      const slug = getSlug(d.url);
      const href = slug ? esc(DATA_BASE + '/deal/' + slug + '/') : safeUrl(d.url);
      return `<a href="${href}">${esc(d.name)}</a> <small>${esc(d.label || '')}</small>`;
    }).join('<br>');
    const marker = window.L.marker([g.lat, g.lng]).addTo(map).bindPopup(`<b>${esc(g.address)}</b><br>${list}`, { maxWidth: 320 });
    markers.push(marker);
  });
  if (markers.length && fitBounds) map.fitBounds(window.L.latLngBounds(markers.map(m => m.getLatLng())), { padding: [30, 30] });
}

let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return leafletLoading;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('search-box').addEventListener('input', renderAll);
  document.getElementById('location-filter').addEventListener('change', renderAll);
  document.getElementById('status-filter').addEventListener('change', e => { statusFilter = e.target.value; renderAll(); });
  document.getElementById('offer-filter').addEventListener('change', e => { offerFilter = e.target.value; renderAll(); });
  document.getElementById('category-filter').addEventListener('change', e => { categoryFilter = e.target.value; renderAll(); });
  document.getElementById('activity-filter').addEventListener('change', e => { activityFilter = e.target.value; renderAll(); });
  document.getElementById('province-filter').addEventListener('change', e => { provinceFilter = e.target.value; renderAll(); });
  document.getElementById('geo-filter').addEventListener('change', e => { geoFilter = e.target.value; renderAll(); });
  document.getElementById('date-filter').addEventListener('change', e => { dateFilter = e.target.value; renderAll(); });
  document.getElementById('change-filter').addEventListener('change', e => { changeFilter = e.target.value; renderAll(); });
  document.querySelectorAll('#deals-table th[data-col]').forEach(th => th.addEventListener('click', () => {
    if (sortCol === th.dataset.col) sortAsc = !sortAsc;
    else { sortCol = th.dataset.col; sortAsc = th.dataset.col === 'end_ts'; }
    renderTable();
  }));
  document.querySelectorAll('.view-toggle button').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  loadInitial();
});

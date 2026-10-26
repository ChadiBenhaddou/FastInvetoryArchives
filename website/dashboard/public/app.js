// Private SEO dashboard: keyword explorer, content planning, publications. Reads data.json (built from
// research/ and the articles); actions go through /api/dispatch (Cloudflare Access + admin list).
const data = await (await fetch('data.json', { cache: 'no-store' })).json();
const view = document.getElementById('view');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (v) => (v === null || v === undefined ? '<span class="muted">—</span>' : esc(v));
const site = (path) => `${data.siteUrl}${path}`;
const STATUSES = ['nouveau', 'planifie', 'redige', 'approuve', 'publie', 'mis-a-jour', 'ecarte'];

document.getElementById('meta').textContent =
    `Données du ${new Date(data.generatedAt).toLocaleString('fr-MA')} · publication auto ${data.settings.autoPublish ? 'activée' : 'désactivée'} · ${data.keywords.length} mots-clés · ${data.articles.length} articles`;

// ------------------------------------------------------------------ keywords
const state = { q: '', cluster: '', offer: '', status: '', lang: '', staleOnly: false, sort: 'volume', dir: -1 };

function filtered() {
    const q = state.q.toLowerCase();
    return data.keywords
        .filter((k) => (!q || k.keyword.toLowerCase().includes(q)) && (!state.cluster || k.cluster === state.cluster) && (!state.offer || k.offer === state.offer)
            && (!state.status || k.status === state.status) && (!state.lang || k.language === state.lang) && (!state.staleOnly || k.stale))
        .sort((a, b) => {
            const x = a[state.sort], y = b[state.sort];
            if (x === y) return 0;
            if (x === null || x === undefined) return 1;
            if (y === null || y === undefined) return -1;
            return (x > y ? 1 : -1) * state.dir;
        });
}

function csv(rows) {
    const cols = ['keyword', 'language', 'volume', 'difficulty', 'competition', 'cpc', 'cluster', 'offer', 'intent', 'status', 'sources', 'retrievedAt', 'stale', 'articleUrl'];
    const cell = (v) => `"${String(Array.isArray(v) ? v.join(' ') : v ?? '').replace(/"/g, '""')}"`;
    return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

function renderKeywords() {
    const rows = filtered();
    const options = (values, current) => ['<option value="">Tous</option>', ...values.map((v) => `<option ${v === current ? 'selected' : ''}>${esc(v)}</option>`)].join('');
    const clusters = [...new Set(data.keywords.map((k) => k.cluster).filter(Boolean))].sort();
    const head = [['keyword', 'Mot-clé'], ['language', 'Langue'], ['volume', 'Volume'], ['difficulty', 'Difficulté'], ['competition', 'Concurrence'], ['cpc', 'CPC $'], ['cluster', 'Cluster'], ['offer', 'Offre'], ['intent', 'Intention'], ['status', 'Statut'], ['retrievedAt', 'Donnée du']];
    view.innerHTML = `
        <div class="bar">
            <input id="q" placeholder="Rechercher…" value="${esc(state.q)}" />
            <select id="cluster">${options(clusters, state.cluster)}</select>
            <select id="offer">${options(['inventaire', 'sur-mesure'], state.offer)}</select>
            <select id="status">${options(STATUSES, state.status)}</select>
            <select id="lang">${options(['fr', 'ar'], state.lang)}</select>
            <label><input type="checkbox" id="staleOnly" ${state.staleOnly ? 'checked' : ''}/> données périmées</label>
            <button class="action" id="export">Export CSV (${rows.length})</button>
        </div>
        <table><thead><tr>${head.map(([k, l]) => `<th data-sort="${k}">${l}${state.sort === k ? (state.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}<th>Concurrents (SERP)</th></tr></thead>
        <tbody>${rows.slice(0, 500).map((k) => `<tr>
            <td>${esc(k.keyword)}${k.legal ? ' <span class="tag">juridique</span>' : ''}${k.articleUrl ? `<br><a href="${esc(site(k.articleUrl))}">${esc(k.articleUrl)}</a>` : ''}</td>
            <td>${esc(k.language)}</td><td>${fmt(k.volume)}</td><td>${fmt(k.difficulty)}</td><td>${fmt(k.competition)}</td><td>${fmt(k.cpc)}</td>
            <td>${fmt(k.cluster)}</td><td>${fmt(k.offer)}</td><td>${fmt(k.intent)} <span class="muted">(${esc(k.classifiedBy)})</span></td><td>${esc(k.status)}</td>
            <td class="${k.stale ? 'stale' : ''}">${k.retrievedAt ? esc(k.retrievedAt.slice(0, 10)) : '—'} <span class="muted">${esc(k.sources.join(', '))}</span></td>
            <td>${k.competitors.map((c) => `<a href="${esc(c.url)}" rel="noreferrer">${c.rank}. ${esc(c.domain)}</a>`).join('<br>') || '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table>
        ${rows.length > 500 ? '<p class="muted">500 premières lignes affichées ; l’export CSV contient tout.</p>' : ''}`;
    for (const id of ['q', 'cluster', 'offer', 'status', 'lang']) view.querySelector(`#${id}`).addEventListener(id === 'q' ? 'input' : 'change', (e) => { state[id] = e.target.value; renderKeywords(); if (id === 'q') view.querySelector('#q').focus(); });
    view.querySelector('#staleOnly').addEventListener('change', (e) => { state.staleOnly = e.target.checked; renderKeywords(); });
    view.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => { state.dir = state.sort === th.dataset.sort ? -state.dir : -1; state.sort = th.dataset.sort; renderKeywords(); }));
    view.querySelector('#export').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + csv(rows)], { type: 'text/csv;charset=utf-8' }));
        a.download = `mots-cles-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
    });
}

// ------------------------------------------------------------------ planning
function renderPlanning() {
    const uncovered = data.keywords.filter((k) => k.status === 'nouveau' && k.cluster && (k.volume ?? 0) > 0).sort((a, b) => b.volume - a.volume).slice(0, 30);
    view.innerHTML = `
        <h2>Clusters</h2>
        <div class="grid">${data.clusters.map((c) => `<div class="card"><strong>${esc(c.key)}</strong><br>
            ${c.keywords} mot(s)-clé(s), ${c.uncovered} sans article<br>
            <span class="muted">${c.articles.length} article(s) publiés</span>${c.articles.length ? '<br>' + c.articles.map((s) => `<a href="${esc(site(`/blog/${s}/`))}">${esc(s)}</a>`).join('<br>') : ''}</div>`).join('')}</div>
        <h2>Mots-clés sans article (par volume)</h2>
        <table><thead><tr><th>Mot-clé</th><th>Volume</th><th>Cluster</th><th>Offre</th><th>Juridique</th></tr></thead><tbody>
        ${uncovered.map((k) => `<tr><td>${esc(k.keyword)}</td><td>${fmt(k.volume)}</td><td>${esc(k.cluster)}</td><td>${esc(k.offer)}</td><td>${k.legal ? 'oui (relecture)' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucun : lancer une recherche ou importer un CSV.</td></tr>'}</tbody></table>
        <h2>Cannibalisation possible</h2>
        ${data.cannibalisation.length ? `<ul>${data.cannibalisation.map((c) => `<li>${esc(c.a)} ↔ ${esc(c.b)} (similarité ${c.similarity})</li>`).join('')}</ul>` : '<p class="muted">Aucune paire d’articles trop proche.</p>'}
        <h2>Articles</h2>
        <table><thead><tr><th>Titre</th><th>Mot-clé principal</th><th>Secondaires</th><th>Offre</th><th>Statut</th><th>Dates</th></tr></thead><tbody>
        ${data.articles.map((a) => `<tr><td><a href="${esc(site(`/blog/${a.slug}/`))}">${esc(a.title)}</a></td><td>${esc(a.primaryKeyword)}</td><td class="muted">${esc(a.secondaryKeywords.join(', '))}</td><td>${esc(a.offer)}</td><td>${a.draft ? 'brouillon' : 'publié'}</td><td>${esc(a.pubDate.slice(0, 10))}${a.updatedDate ? ` / ${esc(a.updatedDate.slice(0, 10))}` : ''}</td></tr>`).join('')}</tbody></table>
        <h2>Briefs</h2>
        ${data.briefs.length ? `<ul>${data.briefs.map((b) => `<li>${esc(b.date)} — ${esc(b.slug)} (${esc(b.primaryKeyword)}, ${esc(b.source)})${b.requiresReview ? ' — relecture obligatoire' : ''}</li>`).join('')}</ul>` : '<p class="muted">Aucun brief enregistré.</p>'}`;
}

// ------------------------------------------------------------------ publications
async function dispatch(body) {
    const res = await fetch('/api/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await res.json().catch(() => ({}));
    alert(res.ok ? 'Demande envoyée : le workflow GitHub démarre (quelques minutes).' : `Refusé : ${result.error ?? res.status}`);
}

function renderPublications() {
    const pubs = [...data.publications].reverse();
    const ai = Object.entries(data.usage.ai ?? {}).map(([m, v]) => `${m} : ${v.toFixed(2)} $`).join(' · ') || '—';
    const dfs = data.usage.dataforseo ? Object.entries(data.usage.dataforseo.months ?? {}).map(([m, v]) => `${m} : ${v.toFixed(2)} $`).join(' · ') : '—';
    view.innerHTML = `
        <div class="bar">
            <button class="action primary" id="run">Lancer l’article du jour maintenant</button>
            <button class="action" id="research">Recherche de mots-clés (budget limité)</button>
            <span class="muted">Dépenses IA : ${esc(ai)} · DataForSEO : ${esc(dfs)} (budget ${data.settings.monthlyBudgetUsd} $/mois)</span>
        </div>
        <table><thead><tr><th>Date</th><th>Article</th><th>Mode</th><th>Raison</th><th>Porte qualité</th><th></th></tr></thead><tbody>
        ${pubs.map((p) => `<tr><td>${esc(p.date)}</td><td><a href="${esc(site(p.url))}">${esc(p.slug)}</a><br><span class="muted">${esc(p.primaryKeyword ?? '')}</span></td>
            <td>${esc(p.mode)}</td><td>${esc(p.reason)}</td>
            <td>${(p.checks ?? []).map((c) => `<span class="${c.ok ? 'ok' : 'ko'}">${c.ok ? '✓' : '✗'}</span> ${esc(c.name)}`).join('<br>')}</td>
            <td>${p.mode === 'publish' ? `<button class="action" data-unpublish="${esc(p.slug)}">Dépublier</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aucune publication automatique pour l’instant.</td></tr>'}</tbody></table>`;
    view.querySelector('#run').addEventListener('click', () => confirm('Lancer la recherche et la rédaction de l’article du jour ?') && dispatch({ action: 'run-daily' }));
    view.querySelector('#research').addEventListener('click', () => confirm('Lancer une recherche DataForSEO (Maroc, français) dans la limite du budget ?') && dispatch({ action: 'research' }));
    view.querySelectorAll('[data-unpublish]').forEach((b) => b.addEventListener('click', () => {
        const reason = prompt(`Dépublier « ${b.dataset.unpublish} » ? Raison :`);
        if (reason !== null) dispatch({ action: 'unpublish', slug: b.dataset.unpublish, reason });
    }));
}

const TABS = { keywords: renderKeywords, planning: renderPlanning, publications: renderPublications };
document.querySelectorAll('[role=tab]').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('[role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    TABS[tab.dataset.tab]();
}));
renderKeywords();

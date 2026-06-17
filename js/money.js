/* ----------------------------------------------------
   money.js — the "Money" tab
   Food-spending patterns + a "Recap to planner" table that
   mirrors the columns of 'Rafi's Financial Planner - CNY'
   so you can copy rows and paste them straight in.

   Planner transaction columns (H–N):
     Date · Transactions · Amount · Cashflow · Category · Dari Account · Ke Account
   For food: Cashflow = "Spending", Category = Makan/Minum,
   Dari Account = paying account, Ke Account = "- not applicable -".
----------------------------------------------------- */

const Money = (() => {
  const $ = (id) => document.getElementById(id);
  const ACCOUNTS = ['Bank of China','Weixin Pay','Student Card','Alipay','Cash','ICBC'];
  const NA = '- not applicable -';
  let chartInstance = null;
  let currentRange = 'week';
  let recapGroup = 'month'; // day | week | month — how the recap list is grouped

  function init() {
    document.querySelectorAll('.money-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.money-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRange = btn.dataset.range;
        renderChart();
        renderInsights();
      });
    });
    $('copyRecapBtn').addEventListener('click', copyRows);
    $('showRecapped').addEventListener('change', renderRecap);
    $('editFoodBudgetBtn').addEventListener('click', editBudget);

    recapGroup = Storage.getSetting('recapGroup', 'month');
    document.querySelectorAll('.recap-group-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.group === recapGroup);
      btn.addEventListener('click', () => {
        recapGroup = btn.dataset.group;
        Storage.setSetting('recapGroup', recapGroup);
        document.querySelectorAll('.recap-group-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderRecap();
      });
    });
  }

  // Group key + display label for a date, by the current grouping mode.
  function groupOf(dateStr) {
    if (recapGroup === 'month') {
      return { key: dateStr.slice(0, 7), label: monthLabel(parseDate(dateStr.slice(0, 7) + '-01')) };
    }
    if (recapGroup === 'week') {
      const d = parseDate(dateStr); const dow = (d.getDay() + 6) % 7;
      const start = new Date(d); start.setDate(d.getDate() - dow);
      const ks = formatDate(start);
      return { key: ks, label: 'Week of ' + new Date(ks + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
    }
    return { key: dateStr, label: prettyDate(dateStr) };
  }

  // All food entries that carry a price, oldest → newest.
  function pricedEntries() {
    return Storage.getFoodLogs()
      .filter(e => e.price != null && !isNaN(e.price))
      .sort((a, b) => (a.date + (a.time||'')).localeCompare(b.date + (b.time||'')));
  }

  function rangeCutoff() {
    if (currentRange === 'all') return '0000-00-00';
    const days = currentRange === 'week' ? 7 : 30;
    const d = new Date(); d.setDate(d.getDate() - (days - 1));
    return formatDate(d);
  }

  function render() { renderSummary(); renderBudget(); renderChart(); renderInsights(); renderRecap(); }

  const RANGE_LABEL = { week: 'last 7 days', month: 'last 30 days', all: 'all time' };

  // ---- Monthly food budget (¥) ----
  function editBudget() {
    const cur = Storage.getSetting('foodBudgetMonthly', '');
    const n = prompt('Monthly food budget (¥) — blank to clear:', cur || '');
    if (n === null) return;
    const v = parseFloat(n);
    Storage.setSetting('foodBudgetMonthly', (n.trim() === '' || isNaN(v) || v <= 0) ? null : v);
    renderBudget();
  }

  function renderBudget() {
    const budget = Storage.getSetting('foodBudgetMonthly', null);
    const ym = formatDate(new Date()).slice(0, 7);
    const spent = pricedEntries().filter(e => e.date.slice(0, 7) === ym).reduce((s, e) => s + e.price, 0);
    const fill = $('foodBudgetFill');
    if (!budget) {
      fill.style.width = '0%';
      fill.className = 'budget-fill';
      $('foodBudgetTarget').textContent = 'No budget set';
      $('foodBudgetLeft').textContent = `¥${spent.toFixed(0)} spent`;
      $('foodBudgetLeft').className = 'budget-left';
      return;
    }
    const pct = Math.min(100, Math.round(spent / budget * 100));
    const left = budget - spent;
    // days left in the current month (incl. today) → pace guidance
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(1, daysInMonth - now.getDate() + 1);
    fill.style.width = pct + '%';
    fill.className = 'budget-fill' + (spent > budget ? ' over' : '');
    $('foodBudgetTarget').textContent = `¥${spent.toFixed(0)} / ¥${budget.toFixed(0)}`;
    $('foodBudgetLeft').textContent = left >= 0
      ? `¥${left.toFixed(0)} left · ¥${(left / daysLeft).toFixed(0)}/day`
      : `¥${Math.abs(left).toFixed(0)} over`;
    $('foodBudgetLeft').className = 'budget-left' + (left < 0 ? ' over' : '');
  }

  // ---- Best-value / pattern insights over the selected range ----
  function renderInsights() {
    $('insightsRange').textContent = '· ' + RANGE_LABEL[currentRange];
    const cut = rangeCutoff();
    const rows = pricedEntries().filter(e => e.date >= cut);
    const box = $('moneyInsights');
    if (rows.length === 0) {
      box.innerHTML = `<div class="empty-state small">No priced food in this range yet.</div>`;
      return;
    }
    const items = [];

    // best value: most kcal per ¥ (needs calories + price > 0)
    const valued = rows.filter(e => e.calories > 0 && e.price > 0);
    if (valued.length) {
      const best = valued.reduce((a, b) => (b.calories / b.price > a.calories / a.price ? b : a));
      items.push(['💎', 'Best value', `${escapeHtml(best.name)} — ${best.calories} kcal for ¥${best.price} (${Math.round(best.calories / best.price)} kcal/¥)`]);
    }
    // priciest single meal
    const priciest = rows.reduce((a, b) => (b.price > a.price ? b : a));
    items.push(['💸', 'Priciest item', `${escapeHtml(priciest.name)} — ¥${priciest.price.toFixed(2)}`]);

    // biggest-spend day
    const byDate = {};
    rows.forEach(e => { byDate[e.date] = (byDate[e.date] || 0) + e.price; });
    const topDay = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0];
    items.push(['📅', 'Biggest day', `${prettyDate(topDay[0])} — ¥${topDay[1].toFixed(2)}`]);

    // average per day that had spending
    const dayCount = Object.keys(byDate).length;
    const total = rows.reduce((s, e) => s + e.price, 0);
    items.push(['📊', 'Avg / logged day', `¥${(total / dayCount).toFixed(2)} across ${dayCount} day${dayCount > 1 ? 's' : ''}`]);

    // drink share of spend
    const minum = rows.filter(e => e.payCategory === 'Minum').reduce((s, e) => s + e.price, 0);
    if (total > 0) items.push(['🥤', 'Drinks', `${Math.round(minum / total * 100)}% of food spend (¥${minum.toFixed(0)})`]);

    box.innerHTML = items.map(([icon, label, txt]) =>
      `<div class="insight-row"><span class="insight-icon">${icon}</span><div class="insight-body"><span class="insight-label">${label}</span><span class="insight-text">${txt}</span></div></div>`
    ).join('');
  }

  // ---- Summary cards ----
  function renderSummary() {
    const all = pricedEntries();
    const ym = formatDate(new Date()).slice(0, 7); // current YYYY-MM
    const month = all.filter(e => e.date.slice(0, 7) === ym);

    const monthTotal = month.reduce((s, e) => s + e.price, 0);
    $('moneyMonthTotal').textContent = monthTotal ? monthTotal.toFixed(2) : '0';

    // cost efficiency over the selected range: ¥ per 1000 kcal
    const cut = rangeCutoff();
    const inRange = all.filter(e => e.date >= cut);
    const spent = inRange.reduce((s, e) => s + e.price, 0);
    const kcal = inRange.reduce((s, e) => s + (e.calories || 0), 0);
    $('moneyPerKcal').textContent = kcal ? (spent / kcal * 1000).toFixed(1) : '—';

    const makan = month.filter(e => e.payCategory !== 'Minum').reduce((s, e) => s + e.price, 0);
    const minum = month.filter(e => e.payCategory === 'Minum').reduce((s, e) => s + e.price, 0);
    $('moneySplit').textContent = `¥${makan.toFixed(0)} · ¥${minum.toFixed(0)}`;
  }

  // ---- Spend-per-day chart ----
  function renderChart() {
    renderSummary(); // efficiency stat depends on range
    const cut = rangeCutoff();
    const entries = pricedEntries().filter(e => e.date >= cut);
    const ctx = $('moneyChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    if (entries.length === 0) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.font = 'italic 14px Fraunces, serif';
      ctx.fillStyle = '#9a9183';
      ctx.textAlign = 'center';
      ctx.fillText('No priced food in this range yet.', ctx.canvas.width / 2, ctx.canvas.height / 2);
      return;
    }

    // sum by date
    const byDate = {};
    entries.forEach(e => { byDate[e.date] = (byDate[e.date] || 0) + e.price; });
    const dates = Object.keys(byDate).sort();

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        datasets: [{
          label: 'Spend',
          data: dates.map(d => byDate[d]),
          backgroundColor: 'rgba(184, 93, 62, 0.75)',
          borderRadius: 4,
          maxBarThickness: 34,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#2a2520',
            titleFont: { family: 'Geist', size: 12 },
            bodyFont: { family: 'JetBrains Mono', size: 13 },
            padding: 10,
            callbacks: { label: (c) => `¥${c.parsed.y.toFixed(2)}` },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(217, 210, 196, 0.5)' },
            ticks: { font: { family: 'JetBrains Mono', size: 11 }, color: '#6b6358', callback: (v) => '¥' + v },
          },
          x: {
            grid: { display: false },
            ticks: { font: { family: 'JetBrains Mono', size: 10 }, color: '#9a9183', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
          },
        },
      },
    });
  }

  // ---- Recap table ----
  function accountOptions(sel) {
    return ACCOUNTS.map(a => `<option value="${a}" ${a === sel ? 'selected' : ''}>${a}</option>`).join('');
  }

  function pendingRows() { return pricedEntries().filter(e => !e.recapped); }

  function renderRecap() {
    const showAll = $('showRecapped').checked;
    const rows = pricedEntries().filter(e => showAll || !e.recapped);
    const pending = pendingRows().length;
    const wrap = $('recapTable');

    $('copyRecapBtn').disabled = pending === 0;
    $('copyRecapBtn').textContent = pending ? `⧉ Copy ${pending} row${pending > 1 ? 's' : ''}` : '⧉ Nothing to copy';

    if (rows.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No priced food to recap. Add a price when you log a meal and it shows up here.</div>`;
      return;
    }

    // group by day/week/month (newest first) so a long list stays organized
    const groups = {};
    rows.forEach(e => {
      const g = groupOf(e.date);
      (groups[g.key] = groups[g.key] || { label: g.label, items: [] }).items.push(e);
    });
    const keys = Object.keys(groups).sort().reverse();

    wrap.innerHTML = keys.map(k => {
      const { label, items } = groups[k];
      const subtotal = items.reduce((s, e) => s + e.price, 0);
      const allDone = items.every(e => e.recapped);
      return `
      <div class="recap-group${allDone ? ' done' : ''}" data-key="${k}">
        <button class="recap-group-head">
          <span class="rg-chev">▾</span>
          <span class="rg-date">${label}</span>
          <span class="rg-sum">¥${subtotal.toFixed(2)} · ${items.length}</span>
        </button>
        <div class="recap-group-body">
          ${items.map(rowHtml).join('')}
        </div>
      </div>`;
    }).join('');

    wrap.querySelectorAll('.recap-group-head').forEach(h =>
      h.addEventListener('click', () => h.closest('.recap-group').classList.toggle('collapsed')));
    wrap.querySelectorAll('.rc-cat').forEach(sel => sel.addEventListener('change', () => updateEntry(sel.dataset.id, { payCategory: sel.value })));
    wrap.querySelectorAll('.rc-acc').forEach(sel => sel.addEventListener('change', () => updateEntry(sel.dataset.id, { account: sel.value })));
  }

  function rowHtml(e) {
    const showDate = recapGroup !== 'day';
    return `
      <div class="recap-row ${e.recapped ? 'done' : ''}" data-id="${e.id}">
        <div class="rc-top">
          ${showDate ? `<span class="rc-date">${e.date.slice(5)}</span>` : ''}
          <span class="rc-name" title="${escapeAttr(e.name)}">${escapeHtml(e.name)}</span>
          <span class="rc-amt">¥${e.price.toFixed(2)}</span>
          ${e.recapped ? '<span class="rc-flag">✓</span>' : ''}
        </div>
        <div class="rc-bottom">
          <select class="rc-cat" data-id="${e.id}"><option value="Makan" ${e.payCategory!=='Minum'?'selected':''}>Makan (food)</option><option value="Minum" ${e.payCategory==='Minum'?'selected':''}>Minum (drink)</option></select>
          <select class="rc-acc" data-id="${e.id}">${accountOptions(e.account || 'Student Card')}</select>
        </div>
      </div>`;
  }

  function updateEntry(id, patch) {
    const e = Storage.getFoodLogById(Number(id));
    if (!e) return;
    Storage.saveFoodLog({ ...e, ...patch });
    if (patch.account) Storage.setSetting('lastAccount', patch.account);
  }

  // Build tab-separated rows (H–N) and copy them, then mark entries recapped.
  function copyRows() {
    const rows = pendingRows();
    if (rows.length === 0) return;
    const tsv = rows.map(e => [
      e.date,
      (e.name || 'Meal').replace(/\t|\n/g, ' '),
      e.price,
      'Spending',
      e.payCategory === 'Minum' ? 'Minum' : 'Makan',
      e.account || 'Student Card',
      NA,
    ].join('\t')).join('\n');

    copyText(tsv).then(() => {
      rows.forEach(e => Storage.saveFoodLog({ ...e, recapped: true }));
      renderRecap();
      const btn = $('copyRecapBtn');
      const prev = btn.textContent;
      btn.textContent = '✓ Copied! Paste in planner';
      setTimeout(() => { renderRecap(); }, 1800);
    }).catch(err => {
      console.error(err);
      alert('Could not copy automatically. Long-press / select the rows below to copy manually.');
    });
  }

  function copyText(text) {
    // Try the async Clipboard API first; if it's blocked (permissions, non-secure
    // context, etc.) fall back to the legacy textarea + execCommand approach.
    const legacy = () => new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        ok ? resolve() : reject(new Error('execCommand failed'));
      } catch (e) { reject(e); }
    });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(legacy);
    }
    return legacy();
  }

  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function escapeAttr(s){return escapeHtml(s).replace(/"/g,'&quot;');}

  return { init, render };
})();

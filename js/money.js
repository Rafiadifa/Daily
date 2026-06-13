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

  function init() {
    document.querySelectorAll('.money-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.money-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRange = btn.dataset.range;
        renderChart();
      });
    });
    $('copyRecapBtn').addEventListener('click', copyRows);
    $('showRecapped').addEventListener('change', renderRecap);
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

  function render() { renderSummary(); renderChart(); renderRecap(); }

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

    wrap.innerHTML = rows.map(e => `
      <div class="recap-row ${e.recapped ? 'done' : ''}" data-id="${e.id}">
        <div class="rc-top">
          <span class="rc-date">${e.date.slice(5)}</span>
          <span class="rc-name" title="${escapeAttr(e.name)}">${escapeHtml(e.name)}</span>
          <span class="rc-amt">¥${e.price.toFixed(2)}</span>
          ${e.recapped ? '<span class="rc-flag">✓ copied</span>' : ''}
        </div>
        <div class="rc-bottom">
          <select class="rc-cat" data-id="${e.id}"><option value="Makan" ${e.payCategory!=='Minum'?'selected':''}>Makan (food)</option><option value="Minum" ${e.payCategory==='Minum'?'selected':''}>Minum (drink)</option></select>
          <select class="rc-acc" data-id="${e.id}">${accountOptions(e.account || 'Student Card')}</select>
        </div>
      </div>`).join('');

    wrap.querySelectorAll('.rc-cat').forEach(sel => sel.addEventListener('change', () => updateEntry(sel.dataset.id, { payCategory: sel.value })));
    wrap.querySelectorAll('.rc-acc').forEach(sel => sel.addEventListener('change', () => updateEntry(sel.dataset.id, { account: sel.value })));
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

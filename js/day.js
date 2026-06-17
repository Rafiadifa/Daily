/* ----------------------------------------------------
   day.js  — the "Day" tab controller
   Calendar + everything about a single day:
   weekly summary · net calories · budget · burned/sport
   · water (ring + quick add) · fasting window · food log
   · favorites · reflection note. All tied to selectedDate.
----------------------------------------------------- */

const Day = (() => {
  let selectedDate = formatDate(new Date());
  let viewMonth = new Date();
  let calMode = 'week'; // 'week' strip or full 'month' grid
  let currentPhoto = null;
  let currentItems = [];
  let editingEntry = null;
  let itemSeq = 1;
  let burnedSaveTimer = null;
  let noteSaveTimer = null;

  const $ = (id) => document.getElementById(id);
  const WATER_RING_C = 2 * Math.PI * 42; // circumference for r=42

  // Payment accounts (must match the planner's Setup dropdown exactly).
  const ACCOUNTS = ['Bank of China','Weixin Pay','Student Card','Alipay','Cash','ICBC'];
  // Words that suggest a drink → planner category "Minum"; otherwise "Makan".
  const DRINK_WORDS = /\b(tea|coffee|kopi|latte|espresso|americano|cappuccino|water|air|juice|jus|soda|cola|milk|susu|smoothie|shake|slushie|mixue|boba|bubble|electrolyte|pocari|beer|wine|drink|minum|es )\b/i;
  const guessCategory = (text) => DRINK_WORDS.test(String(text || '')) ? 'Minum' : 'Makan';

  // An item is now just a name + calories (the number comes from AI / manual).
  function newItem() { return { id:'it'+(itemSeq++), kind:'manual', name:'', calories:0 }; }

  // Pull a calorie count and a price out of pasted/free text.
  function parseEstimate(text) {
    const t = String(text || '');
    let calories = null, price = null;
    // calories: a number directly tied to kcal/cal/calorie(s)
    let m = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:k?cal|calorie|kkal|kalori)/i)
         || t.match(/(?:k?cal|calorie|kkal|kalori)\D{0,4}(\d[\d,]*(?:\.\d+)?)/i);
    if (m) calories = Math.round(parseFloat(m[1].replace(/,/g, '')));
    // price: a number tied to a currency marker (¥, yuan, rmb, cny, 元, rp)
    let p = t.match(/(?:¥|cny|rmb|rp)\s*(\d[\d,]*(?:\.\d+)?)/i)
         || t.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:¥|yuan|rmb|cny|元|kuai|块|rp)/i);
    if (p) price = parseFloat(p[1].replace(/,/g, ''));
    return { calories, price };
  }

  function waterGoal() {
    const manual = Storage.getSetting('waterGoal', null);
    return manual || Calories.waterTarget(Storage.getEffectiveWeight());
  }

  // ============================================================
  function init() {
    calMode = Storage.getSetting('calMode', 'week');
    $('dayCalPrev').addEventListener('click', () => calMode === 'week' ? shiftDay(-7) : shiftMonth(-1));
    $('dayCalNext').addEventListener('click', () => calMode === 'week' ? shiftDay(7) : shiftMonth(1));
    $('calModeBtn').addEventListener('click', toggleCalMode);
    $('dayPrev').addEventListener('click', () => shiftDay(-1));
    $('dayNext').addEventListener('click', () => shiftDay(1));
    initCollapsibles();

    $('burnedInput').addEventListener('input', () => {
      clearTimeout(burnedSaveTimer);
      burnedSaveTimer = setTimeout(() => {
        const v = parseInt($('burnedInput').value);
        Storage.setDailySummary(selectedDate, { caloriesBurned: isNaN(v) ? null : v });
        renderNetCard(); renderWeekSummary();
      }, 400);
    });
    $('sportSelect').addEventListener('change', () => {
      Storage.setDailySummary(selectedDate, { sport: $('sportSelect').value });
      renderCalendar(); renderWeekSummary();
    });
    $('dayNote').addEventListener('input', () => {
      clearTimeout(noteSaveTimer);
      noteSaveTimer = setTimeout(() => Storage.setDailySummary(selectedDate, { note: $('dayNote').value }), 500);
    });

    // Water
    document.querySelectorAll('.water-quick').forEach(b =>
      b.addEventListener('click', () => { Storage.addWater(parseInt(b.dataset.amount), selectedDate); renderWater(); renderWeekSummary(); }));
    $('addCustomWaterBtn').addEventListener('click', () => {
      const amt = parseInt($('customWater').value);
      if (!amt || amt < 1) return;
      Storage.addWater(amt, selectedDate); $('customWater').value=''; renderWater(); renderWeekSummary();
    });
    $('editGoalBtn').addEventListener('click', () => {
      const n = prompt('Daily water goal (ml):', waterGoal());
      if (n && !isNaN(parseInt(n))) { Storage.setSetting('waterGoal', parseInt(n)); renderWater(); renderWeekSummary(); }
    });

    // Meal modal
    $('addFoodBtn').addEventListener('click', () => openModal(null));
    $('addItemBtn').addEventListener('click', () => addItem());
    $('parsePasteBtn').addEventListener('click', applyPaste);
    $('foodPhoto').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { currentPhoto = await compressImage(file, 800, 0.7); }
      catch (err) { console.error(err); alert('Could not process photo'); currentPhoto = null; }
    });
    $('saveFoodBtn').addEventListener('click', saveFood);

    // Refresh fasting countdown every minute (only matters for "today")
    setInterval(() => { if (selectedDate === formatDate(new Date())) renderFasting(); }, 60000);

    render();
  }

  function shiftMonth(d) { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+d, 1); renderCalendar(); }
  function selectDate(ds) { selectedDate = ds; viewMonth = parseDate(ds); render(); }
  // Step the selected day by ±1; keep the month grid aligned to it.
  function shiftDay(delta) {
    const d = parseDate(selectedDate); d.setDate(d.getDate() + delta);
    selectedDate = formatDate(d); viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
  }

  // Generic collapsible section headers (persist open/closed in settings).
  function initCollapsibles() {
    const state = Storage.getSetting('collapsed', {});
    document.querySelectorAll('.section-title.collapsible').forEach(head => {
      const key = head.dataset.toggle;
      const body = document.getElementById(head.dataset.body);
      const def = head.dataset.default === 'collapsed';
      const collapsed = state[key] !== undefined ? state[key] : def;
      const apply = (c) => { head.classList.toggle('collapsed', c); if (body) body.hidden = c; };
      apply(collapsed);
      head.addEventListener('click', () => {
        const c = !head.classList.contains('collapsed');
        apply(c);
        const cur = Storage.getSetting('collapsed', {});
        cur[key] = c; Storage.setSetting('collapsed', cur);
      });
    });
  }

  // ============================================================
  // Weekly summary (rolling last 7 days)
  // ============================================================
  function renderWeekSummary() {
    const goal = waterGoal();
    let calSum=0, calDays=0, netSum=0, netDays=0, waterHit=0, training=0;
    for (let i=0;i<7;i++){
      const d = new Date(); d.setDate(d.getDate()-i);
      const ds = formatDate(d);
      const intake = Storage.getFoodLogs(ds).reduce((s,e)=>s+(e.calories||0),0);
      if (intake>0){ calSum+=intake; calDays++; }
      const sum = Storage.getDailySummary(ds);
      if (sum.caloriesBurned!=null && intake>0){ netSum += intake - sum.caloriesBurned; netDays++; }
      if (Storage.getWaterTotal(ds) >= goal) waterHit++;
      if (sum.sport && sum.sport!=='none') training++;
    }
    $('weekAvgCal').textContent = calDays ? Math.round(calSum/calDays) : '—';
    $('weekNet').textContent = netDays ? (netSum/netDays>0?'+':'') + Math.round(netSum/netDays) : '—';
    $('weekWater').textContent = waterHit + '/7';
    $('weekTraining').textContent = training + '/7';

    // weight change over ~7 days
    const weights = Storage.getWeights();
    let wTxt = '—';
    if (weights.length) {
      const latest = weights[weights.length-1];
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
      const old = [...weights].reverse().find(e => e.date <= formatDate(weekAgo));
      if (old) { const c = latest.weight - old.weight; wTxt = (c>0?'+':'') + c.toFixed(1); }
    }
    $('weekWeight').textContent = wTxt;
  }

  // ============================================================
  // Calendar
  // ============================================================
  function toggleCalMode() {
    calMode = calMode === 'week' ? 'month' : 'week';
    Storage.setSetting('calMode', calMode);
    renderCalendar();
  }

  // One day cell (used by both the week strip and the month grid).
  function dayCellHtml(dateObj, totals, today) {
    const ds = formatDate(dateObj);
    const total = totals[ds] || 0;
    const tier = total===0?'':total<1500?'tier-low':total<2500?'tier-mid':'tier-high';
    const cls = ['cal-cell',tier,ds===today?'today':'',ds===selectedDate?'selected':''].filter(Boolean).join(' ');
    const sum = Storage.getDailySummary(ds);
    const dot = sum.sport && sum.sport!=='none' ? '<span class="activity-dot"></span>' : '';
    return `<div class="${cls}" data-date="${ds}">${dot}<span class="day-num">${dateObj.getDate()}</span>${total>0?`<span class="day-val">${total}</span>`:''}</div>`;
  }

  function renderCalendar() {
    const grid = $('dayCalGrid');
    const totals = Storage.getFoodTotalsByDate();
    const today = formatDate(new Date());
    const week = calMode === 'week';
    grid.classList.toggle('week', week);
    $('calModeBtn').textContent = week ? 'month view ▾' : 'week view ▴';

    let html = '';
    if (week) {
      // strip: the 7 days (Mon–Sun) of the week containing selectedDate
      const sel = parseDate(selectedDate);
      const dow = (sel.getDay()+6)%7;
      const start = new Date(sel); start.setDate(sel.getDate()-dow);
      $('dayCalMonth').textContent = monthLabel(sel);
      for (let i=0;i<7;i++) html += dayCellHtml(new Date(start.getFullYear(), start.getMonth(), start.getDate()+i), totals, today);
    } else {
      const year = viewMonth.getFullYear(), month = viewMonth.getMonth();
      const firstWeekday = (new Date(year, month, 1).getDay()+6)%7;
      const daysInMonth = new Date(year, month+1, 0).getDate();
      $('dayCalMonth').textContent = monthLabel(viewMonth);
      const prevLast = new Date(year, month, 0).getDate();
      for (let i=firstWeekday-1;i>=0;i--) html += `<div class="cal-cell off-month"><span class="day-num">${prevLast-i}</span></div>`;
      for (let day=1; day<=daysInMonth; day++) html += dayCellHtml(new Date(year, month, day), totals, today);
      const trailing = (7 - ((firstWeekday+daysInMonth)%7))%7;
      for (let i=1;i<=trailing;i++) html += `<div class="cal-cell off-month"><span class="day-num">${i}</span></div>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.cal-cell[data-date]').forEach(c => c.addEventListener('click', () => selectDate(c.dataset.date)));
  }

  // ============================================================
  // Day detail
  // ============================================================
  function renderDayDetail() {
    $('dayDateLabel').textContent = prettyDate(selectedDate);
    const sum = Storage.getDailySummary(selectedDate);
    $('burnedInput').value = sum.caloriesBurned ?? '';
    $('sportSelect').value = sum.sport || 'none';
    $('dayNote').value = sum.note || '';
    const ns = $('noteSummary'); if (ns) ns.textContent = (sum.note && sum.note.trim()) ? '· written' : '';
    renderNetCard(); renderBudget(); renderWater(); renderFasting(); renderFavorites(); renderList();
    applyDaySections();
  }

  // Hide Day-tab sections the user has turned off (default: all visible).
  function applyDaySections() {
    const d = Storage.getSetting('daySections', {});
    const set = (id, key) => { const el = $(id); if (el) el.style.display = (d[key] === false) ? 'none' : ''; };
    set('secBurned', 'burned');
    set('fastingWidget', 'fasting');
    set('secWater', 'water');
    set('secReflection', 'reflection');
  }

  function renderNetCard() {
    const intake = Storage.getFoodLogs(selectedDate).reduce((s,e)=>s+(e.calories||0),0);
    const burned = Storage.getDailySummary(selectedDate).caloriesBurned;
    $('totalCalories').textContent = intake;
    if (burned == null) { $('caloriesBurned').textContent='—'; $('caloriesNet').textContent='—'; $('caloriesNet').className='net-value'; }
    else {
      $('caloriesBurned').textContent = burned;
      const net = intake - burned;
      $('caloriesNet').textContent = (net>0?'+':'')+net;
      $('caloriesNet').className = 'net-value ' + (net>100?'positive':net<-100?'negative':'');
    }
  }

  function renderBudget() {
    const profile = { ...Storage.getProfile(), weight: Storage.getEffectiveWeight() };
    const target = Calories.calorieTarget(profile);
    const eaten = Storage.getFoodLogs(selectedDate).reduce((s,e)=>s+(e.calories||0),0);
    const left = target - eaten;
    $('budgetFill').style.width = Math.min(100, Math.round(eaten/target*100)) + '%';
    $('budgetFill').className = 'budget-fill' + (eaten>target?' over':'');
    $('budgetTarget').textContent = `Target ${target}`;
    $('budgetLeft').textContent = left>=0 ? `${left} left` : `${Math.abs(left)} over`;
    $('budgetLeft').className = 'budget-left' + (left<0?' over':'');
  }

  // ---- Water ----
  function renderWater() {
    const total = Storage.getWaterTotal(selectedDate);
    const goal = waterGoal();
    const pct = Math.min(100, Math.round(total/goal*100));
    $('waterRingProgress').style.strokeDasharray = WATER_RING_C;
    $('waterRingProgress').style.strokeDashoffset = WATER_RING_C * (1 - pct/100);
    $('waterRingMl').textContent = total;
    $('waterRingGoal').textContent = `of ${goal}`;
    const summ = $('waterSummary'); if (summ) summ.textContent = `${total} / ${goal} ml`;
    // log — both amount and time are tap-to-edit
    const entries = Storage.getWater(selectedDate).slice().reverse();
    const list = $('waterLog');
    if (entries.length === 0) list.innerHTML = `<div class="empty-state small">No water yet.</div>`;
    else list.innerHTML = entries.map(e => `
      <div class="water-chip"><button class="wedit-amt" data-id="${e.id}" title="Edit amount">${e.amount}ml</button><button class="wedit-time" data-id="${e.id}" title="Edit time">${e.time||'--:--'}</button><button class="wlog-del" data-id="${e.id}">×</button></div>`).join('');
    list.querySelectorAll('.wedit-amt').forEach(b =>
      b.addEventListener('click', () => {
        const id = parseInt(b.dataset.id);
        const cur = Storage.getWater(selectedDate).find(w => w.id === id);
        const n = prompt('Edit amount (ml):', cur ? cur.amount : '');
        if (n === null) return;
        const v = parseInt(n);
        if (!v || v < 1) { alert('Enter a valid amount in ml.'); return; }
        Storage.updateWater(id, { amount: v }); renderWater(); renderWeekSummary();
      }));
    list.querySelectorAll('.wedit-time').forEach(b =>
      b.addEventListener('click', () => {
        const id = parseInt(b.dataset.id);
        const cur = Storage.getWater(selectedDate).find(w => w.id === id);
        const t = prompt('Edit time (HH:MM, 24-hour):', cur ? (cur.time || '') : '');
        if (t === null) return;
        const v = t.trim();
        if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) { alert('Enter a valid time like 14:30.'); return; }
        Storage.updateWater(id, { time: v.padStart(5, '0') }); renderWater();
      }));
    list.querySelectorAll('.wlog-del').forEach(b =>
      b.addEventListener('click', () => { Storage.deleteWater(parseInt(b.dataset.id)); renderWater(); renderWeekSummary(); }));
  }

  // ---- Fasting window ----
  function renderFasting() {
    const w = Storage.getSetting('eatingWindow', { enabled:false, start:'06:30', end:'14:30' });
    const widget = $('fastingWidget');
    if (!w.enabled) {
      widget.innerHTML = `<div class="fasting-off">No eating window set · <button id="fastingSetupBtn" class="text-btn">set up</button></div>`;
      $('fastingSetupBtn').addEventListener('click', () => { $('profileBtn').click(); });
      return;
    }
    const isToday = selectedDate === formatDate(new Date());
    const fmt = (mins) => `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,'0')}m`;
    if (!isToday) {
      widget.innerHTML = `<div class="fasting-row"><span class="fasting-icon">🕒</span><div><div class="fasting-status">Eating window</div><div class="fasting-window">${w.start} – ${w.end}</div></div></div>`;
      return;
    }
    const now = new Date();
    const mk = (hhmm) => { const [h,m]=hhmm.split(':').map(Number); const d=new Date(now); d.setHours(h,m,0,0); return d; };
    let start = mk(w.start), end = mk(w.end);
    const crosses = start > end;
    const inWindow = crosses ? (now>=start || now<end) : (now>=start && now<end);
    let icon, status, sub, until;
    if (inWindow) {
      let close = end; if (crosses && now>=start) close = new Date(end.getTime()+24*3600*1000);
      until = Math.max(0, Math.round((close-now)/60000));
      icon='🍽'; status='Eating window open'; sub=`closes in ${fmt(until)}`;
    } else {
      let open = start;
      if (now >= start) open = new Date(start.getTime()+24*3600*1000); // already past today's start
      if (crosses && now>=end && now<start) open = start;
      until = Math.max(0, Math.round((open-now)/60000));
      icon='🌙'; status='Fasting'; sub=`window opens in ${fmt(until)}`;
    }
    widget.innerHTML = `<div class="fasting-row ${inWindow?'open':'fasting'}">
      <span class="fasting-icon">${icon}</span>
      <div><div class="fasting-status">${status}</div><div class="fasting-window">${sub} · ${w.start}–${w.end}</div></div></div>`;
  }

  // ---- Favorites ----
  function renderFavorites() {
    const favs = Storage.getFavorites();
    const section = $('favSection');
    const row = $('favoritesRow');
    if (favs.length === 0) { if (section) section.hidden = true; row.innerHTML = ''; return; }
    if (section) section.hidden = false;
    const cnt = $('favCount'); if (cnt) cnt.textContent = favs.length;
    row.innerHTML = favs.map(f => {
      const total = Calories.mealTotal(f.items);
      return `<div class="fav-chip" data-fav="${f.id}"><span class="fav-name">${escapeHtml(f.name)}</span><span class="fav-cal">${total}</span><button class="fav-del" data-del="${f.id}" title="Remove favorite">×</button></div>`;
    }).join('');
    row.querySelectorAll('.fav-chip').forEach(chip => {
      chip.addEventListener('click', (ev) => {
        if (ev.target.closest('.fav-del')) return;
        logFavorite(parseInt(chip.dataset.fav));
      });
    });
    row.querySelectorAll('.fav-del').forEach(b =>
      b.addEventListener('click', (ev) => { ev.stopPropagation(); Storage.deleteFavorite(parseInt(b.dataset.del)); renderFavorites(); }));
  }
  function logFavorite(id) {
    const fav = Storage.getFavorites().find(f => f.id === id);
    if (!fav) return;
    const items = fav.items.map(it => ({ ...it, calories: Calories.estimateItem(it) }));
    Storage.saveFoodLog({
      id: Date.now(), date: selectedDate, time: formatTime(new Date()),
      name: fav.name, items, calories: items.reduce((s,i)=>s+i.calories,0),
      photo: null, notes: '',
    });
    render();
  }
  function saveAsFavorite(entryId) {
    const e = Storage.getFoodLogById(entryId);
    if (!e) return;
    const items = Array.isArray(e.items) && e.items.length ? e.items
      : [{ kind:'manual', name:e.name||'Food', calories:e.calories||0 }];
    Storage.addFavorite({ name: e.name || 'Meal', items });
    renderFavorites();
  }

  // ---- Food list ----
  function renderList() {
    const entries = Storage.getFoodLogs(selectedDate).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    const list = $('foodList');
    if (entries.length === 0) { list.innerHTML = `<div class="empty-state">Nothing logged for this day yet.</div>`; return; }
    list.innerHTML = entries.map(e => {
      const items = Array.isArray(e.items) ? e.items : null;
      const meta = items && items.length
        ? items.map(i => `${escapeHtml(i.name || Calories.itemLabel(i))} ${i.calories}`).join(' · ')
        : `${e.portion?e.portion+'× ':''}${escapeHtml(e.name||'')}`;
      return `<div class="log-item editable" data-edit="${e.id}">
        ${e.photo?`<img class="log-photo" src="${e.photo}" alt="" />`:`<div class="log-photo" style="display:flex;align-items:center;justify-content:center;font-size:22px;">🍽️</div>`}
        <div class="log-info">
          <div class="log-name">${escapeHtml(e.name||'Meal')}</div>
          <div class="log-meta"><span>${e.time||''}</span><span class="meta-breakdown">${meta}</span>${e.price!=null?`<span class="log-price">¥${e.price}${e.recapped?' ✓':''}</span>`:''}</div>
          ${e.notes?`<div class="log-meta" style="margin-top:4px;font-style:italic;">${escapeHtml(e.notes)}</div>`:''}
        </div>
        <div class="log-cal">${e.calories}</div>
        <div class="log-actions">
          <button class="log-fav" data-fav="${e.id}" title="Save as favorite">☆</button>
          <button class="log-delete" data-id="${e.id}" title="Delete">×</button>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.log-item.editable').forEach(row => {
      row.addEventListener('click', (ev) => {
        if (ev.target.closest('.log-delete') || ev.target.closest('.log-fav')) return;
        const entry = Storage.getFoodLogById(parseInt(row.dataset.edit));
        if (entry) openModal(entry);
      });
    });
    list.querySelectorAll('.log-fav').forEach(b =>
      b.addEventListener('click', (ev) => { ev.stopPropagation(); saveAsFavorite(parseInt(b.dataset.fav)); b.textContent='★'; }));
    list.querySelectorAll('.log-delete').forEach(b =>
      b.addEventListener('click', (ev) => { ev.stopPropagation(); if (confirm('Delete this meal?')) { Storage.deleteFoodLog(parseInt(b.dataset.id)); render(); } }));
  }

  // ============================================================
  // Meal modal — item cards
  // ============================================================
  function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'item-card simple'; card.dataset.id = item.id;
    card.innerHTML = `
      <input class="item-name" data-f="name" placeholder="Food name" value="${escapeAttr(item.name||'')}" />
      <div class="input-row item-cal-input">
        <input type="number" data-f="calories" placeholder="kcal" value="${item.calories||''}" min="0" step="10" />
        <span class="unit-suffix">kcal</span>
      </div>
      <button type="button" class="item-remove" title="Remove">✕</button>`;
    card.querySelector('.item-remove').addEventListener('click', () => removeItem(item.id));
    const onChange = (e) => {
      const f = e.target.dataset.f; if (!f) return;
      item[f] = f === 'calories' ? (parseFloat(e.target.value) || 0) : e.target.value;
      recalcTotal();
    };
    card.addEventListener('input', onChange);
    return card;
  }
  function recalcTotal() { $('mealTotal').textContent = Calories.mealTotal(currentItems)+' kcal'; }
  function addItem() { const it=newItem(); currentItems.push(it); $('itemsContainer').appendChild(createItemCard(it)); recalcTotal(); return it; }
  function removeItem(id) { currentItems = currentItems.filter(it=>it.id!==id); const c=document.querySelector(`.item-card[data-id="${id}"]`); if(c)c.remove(); recalcTotal(); }

  // Apply the "Quick add" paste box: fill the first item's calories + the price field.
  function applyPaste() {
    const text = $('aiPaste').value.trim();
    if (!text) return;
    const { calories, price } = parseEstimate(text);
    // Use the first item (create one if none), name it from the paste if still blank.
    let item = currentItems[0] || addItem();
    if (!item.name) {
      const name = text.split('\n')[0]
        .replace(/(?:¥|cny|rmb|rp)\s*[\d.,]+.*/ig, '')                                            // drop currency-prefixed price + rest
        .replace(/[\d.,]+\s*(k?cal|calorie|kkal|kalori|¥|yuan|rmb|cny|元|kuai|块|rp).*/ig, '')   // drop the number + everything after
        .replace(/[\s—–-]*\b(about|approx\.?|approximately|around|roughly|est\.?|estimate[ds]?|is|are|costs?)\b[\s:—–-]*$/i, '') // trailing filler
        .replace(/[~,:;.\s—–-]+$/, '')                                                            // trailing punctuation
        .trim();
      if (name) item.name = name;
    }
    if (calories != null) item.calories = calories;
    if (price != null) $('mealPrice').value = price;
    // re-render the first card so the values show, refresh category guess
    $('itemsContainer').innerHTML = '';
    currentItems.forEach(it => $('itemsContainer').appendChild(createItemCard(it)));
    $('mealCategory').value = guessCategory(text + ' ' + (item.name || ''));
    if (!$('mealName').value.trim() && item.name) $('mealName').value = item.name;
    recalcTotal();
  }

  function openModal(entry) {
    editingEntry = entry || null;
    $('foodModalTitle').textContent = entry ? 'Edit meal' : 'Add meal';
    $('saveFoodBtn').textContent = entry ? 'Update meal' : 'Save meal';
    $('mealName').value = entry?.name || '';
    $('foodNotes').value = entry?.notes || '';
    $('foodPhoto').value = '';
    $('aiPaste').value = '';
    $('mealTime').value = entry?.time || formatTime(new Date());
    $('mealPrice').value = (entry && entry.price != null) ? entry.price : '';
    $('mealCategory').value = entry?.payCategory || guessCategory(entry?.name || '');
    $('mealAccount').value = entry?.account || Storage.getSetting('lastAccount', 'Student Card');
    currentPhoto = entry?.photo || null;
    currentItems = []; $('itemsContainer').innerHTML = '';
    let items;
    if (entry) {
      // Map any entry (incl. old savory/sweet/drink items) down to { name, calories }.
      items = (Array.isArray(entry.items) && entry.items.length)
        ? entry.items.map(it => ({ id:'it'+(itemSeq++), kind:'manual', name: it.name || '', calories: Calories.estimateItem(it) }))
        : [{ id:'it'+(itemSeq++), kind:'manual', name: entry.name||'Food', calories: entry.calories||0 }];
    } else items = [newItem()];
    items.forEach(it => { currentItems.push(it); $('itemsContainer').appendChild(createItemCard(it)); });
    recalcTotal();
    $('foodModal').hidden = false;
  }

  function saveFood() {
    if (currentItems.length === 0) { alert('Add at least one item.'); return; }
    let name = $('mealName').value.trim();
    if (!name) { const n = currentItems.map(it=>(it.name||'').trim()).filter(Boolean); name = n.length?n.join(' + '):'Meal'; }
    const items = currentItems.map(it => ({ name:(it.name||'').trim(), calories: Calories.estimateItem(it) }));
    const priceRaw = parseFloat($('mealPrice').value);
    const price = isNaN(priceRaw) ? null : priceRaw;
    const account = $('mealAccount').value;
    const payCategory = $('mealCategory').value;

    if (editingEntry && editingEntry.recapped &&
        (editingEntry.price !== price || editingEntry.payCategory !== payCategory || editingEntry.account !== account)) {
      alert('Heads up: this entry was already copied to your planner. Re-copying won\'t update it — fix the row in the planner manually.');
    }

    const entry = {
      id: editingEntry ? editingEntry.id : Date.now(),
      date: editingEntry ? editingEntry.date : selectedDate,
      time: $('mealTime').value || formatTime(new Date()),
      name, items, calories: items.reduce((s,i)=>s+i.calories,0),
      price, payCategory, account,
      recapped: editingEntry ? !!editingEntry.recapped : false,
      photo: currentPhoto, notes: $('foodNotes').value.trim(),
    };
    Storage.setSetting('lastAccount', account);
    Storage.saveFoodLog(entry);
    $('foodModal').hidden = true;
    render();
    if (typeof Money !== 'undefined') Money.render();
  }

  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function escapeAttr(s){return escapeHtml(s).replace(/"/g,'&quot;');}

  function render() { renderWeekSummary(); renderCalendar(); renderDayDetail(); }

  return { init, render };
})();

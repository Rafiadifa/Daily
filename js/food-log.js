/* ----------------------------------------------------
   food-log.js
   Calendar + day detail + multi-item meal modal.
   A meal = name + items[] (+ photo, notes). Each item is
   savory / sweet / drink / manual. Click a meal to edit it.
----------------------------------------------------- */

const FoodLog = (() => {
  let selectedDate = formatDate(new Date());
  let viewMonth = new Date();
  let currentPhoto = null;
  let currentItems = [];     // working items in the open modal
  let editingEntry = null;   // entry being edited, or null
  let itemSeq = 1;
  let burnedSaveTimer = null;
  let noteSaveTimer = null;

  const $ = (id) => document.getElementById(id);

  // ---- option lists for item selects ----
  const PORTIONS = [[0.5,'½ small'],[0.75,'¾'],[1,'1 normal'],[1.5,'1½'],[2,'2 large'],[3,'3 huge']];
  const OIL_OPTS = [['none','No oil'],['light','Light'],['medium','Medium'],['heavy','Greasy']];
  const SAUCE_OPTS = [['none','No sauce'],['some','Some'],['lots','Lots']];
  const COOKING_OPTS = [['steamed','Steamed/boiled'],['normal','Stir-fry'],['pan_fried','Pan-fried'],['deep_fried','Deep-fried'],['grilled','Grilled/baked']];
  const RICHNESS_OPTS = [['light','Light'],['normal','Normal'],['rich','Rich/creamy']];
  const SWEET_OPTS = [['none','Unsweet'],['light','Light'],['sweet','Sweet'],['very','Very sweet']];
  const SAVORY_CATS = [['rice','Rice'],['noodles','Noodles'],['bread','Bread/Bun'],['dumplings','Dumplings'],['meat_dish','Meat'],['veggie_dish','Veggies'],['seafood','Seafood'],['egg','Egg'],['tofu','Tofu'],['soup','Soup'],['mixed','Mixed plate'],['other_savory','Other']];
  const SWEET_CATS = [['cake','Cake'],['pastry','Pastry'],['ice_cream','Ice cream'],['cookie','Cookie'],['chocolate','Chocolate'],['candy','Candy'],['sweet_fruit','Fruit'],['yogurt_sweet','Sweet yogurt'],['other_sweet','Other']];
  const DRINK_CATS = [['water','Water'],['unsweet','Tea/Coffee (no sugar)'],['tea_sweet','Sweet/bubble tea'],['soda','Soda'],['juice','Juice'],['milk','Milk'],['latte','Latte'],['smoothie','Smoothie'],['alcohol','Alcohol'],['other_drink','Other']];
  const KIND_LABELS = { savory:'Savory', sweet:'Sweet', drink:'Drink', manual:'Manual' };

  const opts = (list, sel) => list.map(([v,l]) =>
    `<option value="${v}" ${String(v)===String(sel)?'selected':''}>${l}</option>`).join('');

  function defaultCategoryFor(kind) {
    if (kind === 'sweet') return 'cake';
    if (kind === 'drink') return 'unsweet';
    return 'rice';
  }
  function kindPlaceholder(kind) {
    if (kind === 'manual') return 'Food name';
    if (kind === 'sweet') return 'e.g. Chocolate cake';
    if (kind === 'drink') return 'e.g. Latte';
    return 'e.g. Beef & peppers';
  }
  function newItem(kind = 'savory') {
    return {
      id: 'it' + (itemSeq++), kind, name: '',
      category: defaultCategoryFor(kind), portion: 1,
      oil: 'medium', sauce: 'some', cooking: 'normal',
      richness: 'normal', sweet: 'sweet', calories: 0,
    };
  }

  // ============================================================
  function init() {
    $('foodCalPrev').addEventListener('click', () => shiftMonth(-1));
    $('foodCalNext').addEventListener('click', () => shiftMonth(1));

    $('burnedInput').addEventListener('input', () => {
      clearTimeout(burnedSaveTimer);
      burnedSaveTimer = setTimeout(() => {
        const v = parseInt($('burnedInput').value);
        Storage.setDailySummary(selectedDate, { caloriesBurned: isNaN(v) ? null : v });
        renderNetCard();
      }, 400);
    });
    $('sportSelect').addEventListener('change', () => {
      Storage.setDailySummary(selectedDate, { sport: $('sportSelect').value });
      renderCalendar();
    });

    // Daily reflection note
    $('dayNote').addEventListener('input', () => {
      clearTimeout(noteSaveTimer);
      noteSaveTimer = setTimeout(() => {
        Storage.setDailySummary(selectedDate, { note: $('dayNote').value });
      }, 500);
    });

    // Modal
    $('addFoodBtn').addEventListener('click', () => openModal(null));
    $('addItemBtn').addEventListener('click', () => addItem('savory'));
    $('foodPhoto').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { currentPhoto = await compressImage(file, 800, 0.7); }
      catch (err) { console.error(err); alert('Could not process photo'); currentPhoto = null; }
    });
    $('saveFoodBtn').addEventListener('click', saveFood);

    render();
  }

  function shiftMonth(delta) {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
    renderCalendar();
  }
  function selectDate(dateStr) {
    selectedDate = dateStr;
    render();
  }

  // ============================================================
  // Calendar
  // ============================================================
  function renderCalendar() {
    const grid = $('foodCalGrid');
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    $('foodCalMonth').textContent = monthLabel(viewMonth);
    const totals = Storage.getFoodTotalsByDate();
    const today = formatDate(new Date());

    let html = '';
    const prevLast = new Date(year, month, 0).getDate();
    for (let i = firstWeekday - 1; i >= 0; i--) {
      html += `<div class="cal-cell off-month"><span class="day-num">${prevLast - i}</span></div>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = formatDate(new Date(year, month, day));
      const total = totals[ds] || 0;
      const tier = total === 0 ? '' : total < 1500 ? 'tier-low' : total < 2500 ? 'tier-mid' : 'tier-high';
      const cls = ['cal-cell', tier, ds === today ? 'today' : '', ds === selectedDate ? 'selected' : ''].filter(Boolean).join(' ');
      const summary = Storage.getDailySummary(ds);
      const dot = summary.sport && summary.sport !== 'none' ? '<span class="activity-dot"></span>' : '';
      html += `<div class="${cls}" data-date="${ds}">${dot}<span class="day-num">${day}</span>${total > 0 ? `<span class="day-val">${total}</span>` : ''}</div>`;
    }
    const trailing = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;
    for (let i = 1; i <= trailing; i++) {
      html += `<div class="cal-cell off-month"><span class="day-num">${i}</span></div>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => selectDate(cell.dataset.date));
    });
  }

  // ============================================================
  // Day detail
  // ============================================================
  function renderDayDetail() {
    $('foodDateLabel').textContent = prettyDate(selectedDate);
    const summary = Storage.getDailySummary(selectedDate);
    $('burnedInput').value = summary.caloriesBurned ?? '';
    $('sportSelect').value = summary.sport || 'none';
    $('dayNote').value = summary.note || '';
    renderNetCard();
    renderBudget();
    renderList();
  }

  function renderNetCard() {
    const intake = Storage.getFoodLogs(selectedDate).reduce((s, e) => s + (e.calories || 0), 0);
    const burned = Storage.getDailySummary(selectedDate).caloriesBurned;
    $('totalCalories').textContent = intake;
    if (burned == null) {
      $('caloriesBurned').textContent = '—';
      $('caloriesNet').textContent = '—';
      $('caloriesNet').className = 'net-value';
    } else {
      $('caloriesBurned').textContent = burned;
      const net = intake - burned;
      $('caloriesNet').textContent = (net > 0 ? '+' : '') + net;
      $('caloriesNet').className = 'net-value ' + (net > 100 ? 'positive' : net < -100 ? 'negative' : '');
    }
  }

  function renderBudget() {
    const profile = { ...Storage.getProfile(), weight: Storage.getEffectiveWeight() };
    const target = Calories.calorieTarget(profile);
    const eaten = Storage.getFoodLogs(selectedDate).reduce((s, e) => s + (e.calories || 0), 0);
    const left = target - eaten;
    const pct = Math.min(100, Math.round((eaten / target) * 100));
    $('budgetFill').style.width = pct + '%';
    $('budgetFill').className = 'budget-fill' + (eaten > target ? ' over' : '');
    $('budgetTarget').textContent = `Target ${target}`;
    $('budgetLeft').textContent = left >= 0 ? `${left} left` : `${Math.abs(left)} over`;
    $('budgetLeft').className = 'budget-left' + (left < 0 ? ' over' : '');
  }

  function renderList() {
    const entries = Storage.getFoodLogs(selectedDate).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const list = $('foodList');
    if (entries.length === 0) {
      list.innerHTML = `<div class="empty-state">Nothing logged for this day yet.</div>`;
      return;
    }
    list.innerHTML = entries.map(e => {
      const items = Array.isArray(e.items) ? e.items : null;
      let meta;
      if (items && items.length) {
        meta = items.map(i => `${escapeHtml(i.name || Calories.itemLabel(i))} ${i.calories}`).join(' · ');
      } else {
        meta = `${e.portion ? e.portion + '× ' : ''}${escapeHtml(e.name || '')}`;
      }
      return `
      <div class="log-item editable" data-edit="${e.id}">
        ${e.photo ? `<img class="log-photo" src="${e.photo}" alt="" />` : `<div class="log-photo" style="display:flex;align-items:center;justify-content:center;font-size:22px;">🍽️</div>`}
        <div class="log-info">
          <div class="log-name">${escapeHtml(e.name || 'Meal')}</div>
          <div class="log-meta"><span>${e.time || ''}</span><span class="meta-breakdown">${meta}</span></div>
          ${e.notes ? `<div class="log-meta" style="margin-top:4px;font-style:italic;">${escapeHtml(e.notes)}</div>` : ''}
        </div>
        <div class="log-cal">${e.calories}</div>
        <button class="log-delete" data-id="${e.id}" title="Delete">×</button>
      </div>`;
    }).join('');

    list.querySelectorAll('.log-item.editable').forEach(row => {
      row.addEventListener('click', (ev) => {
        if (ev.target.closest('.log-delete')) return; // delete handled separately
        const entry = Storage.getFoodLogById(parseInt(row.dataset.edit));
        if (entry) openModal(entry);
      });
    });
    list.querySelectorAll('.log-delete').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (confirm('Delete this meal?')) { Storage.deleteFoodLog(parseInt(btn.dataset.id)); render(); }
      });
    });
  }

  // ============================================================
  // Meal modal — item cards
  // ============================================================
  function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.id = item.id;
    card.innerHTML = `
      <div class="item-card-head">
        <div class="kind-tabs">
          ${['savory','sweet','drink','manual'].map(k =>
            `<button type="button" data-kind="${k}" class="${item.kind===k?'active':''}">${KIND_LABELS[k]}</button>`).join('')}
        </div>
        <button type="button" class="item-remove" title="Remove">✕</button>
      </div>
      <input class="item-name" data-f="name" placeholder="${kindPlaceholder(item.kind)}" value="${escapeAttr(item.name || '')}" />
      <div class="item-fields"></div>
      <div class="item-cal"><span>0 kcal</span></div>`;

    card.querySelectorAll('.kind-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        item.kind = btn.dataset.kind;
        item.category = defaultCategoryFor(item.kind);
        card.querySelectorAll('.kind-tabs button').forEach(b => b.classList.toggle('active', b === btn));
        card.querySelector('.item-name').placeholder = kindPlaceholder(item.kind);
        renderItemFields(card, item);
        recalcItem(item, card);
      });
    });
    card.querySelector('.item-remove').addEventListener('click', () => removeItem(item.id));

    const onChange = (e) => {
      const f = e.target.dataset.f;
      if (!f) return;
      let val = e.target.value;
      if (f === 'portion') val = parseFloat(val);
      if (f === 'calories') val = parseFloat(val) || 0;
      item[f] = val;
      recalcItem(item, card);
    };
    card.addEventListener('input', onChange);
    card.addEventListener('change', onChange);

    renderItemFields(card, item);
    recalcItem(item, card);
    return card;
  }

  function renderItemFields(card, item) {
    const wrap = card.querySelector('.item-fields');
    if (item.kind === 'manual') {
      wrap.innerHTML = `<label class="ifield wide"><span>Calories (type directly)</span>
        <input type="number" data-f="calories" placeholder="e.g. 450" value="${item.calories || ''}" min="0" step="10" /></label>`;
    } else if (item.kind === 'savory') {
      wrap.innerHTML = `<div class="field-grid">
        <label class="ifield"><span>Type</span><select data-f="category">${opts(SAVORY_CATS, item.category)}</select></label>
        <label class="ifield"><span>Portion</span><select data-f="portion">${opts(PORTIONS, item.portion)}</select></label>
        <label class="ifield"><span>Oil</span><select data-f="oil">${opts(OIL_OPTS, item.oil)}</select></label>
        <label class="ifield"><span>Sauce</span><select data-f="sauce">${opts(SAUCE_OPTS, item.sauce)}</select></label>
        <label class="ifield"><span>Cooking</span><select data-f="cooking">${opts(COOKING_OPTS, item.cooking)}</select></label>
      </div>`;
    } else if (item.kind === 'sweet') {
      wrap.innerHTML = `<div class="field-grid">
        <label class="ifield"><span>Type</span><select data-f="category">${opts(SWEET_CATS, item.category)}</select></label>
        <label class="ifield"><span>Portion</span><select data-f="portion">${opts(PORTIONS, item.portion)}</select></label>
        <label class="ifield"><span>Richness</span><select data-f="richness">${opts(RICHNESS_OPTS, item.richness)}</select></label>
      </div>`;
    } else if (item.kind === 'drink') {
      wrap.innerHTML = `<div class="field-grid">
        <label class="ifield"><span>Type</span><select data-f="category">${opts(DRINK_CATS, item.category)}</select></label>
        <label class="ifield"><span>Servings</span><select data-f="portion">${opts(PORTIONS, item.portion)}</select></label>
        <label class="ifield"><span>Sweetness</span><select data-f="sweet">${opts(SWEET_OPTS, item.sweet)}</select></label>
      </div>`;
    }
  }

  function recalcItem(item, card) {
    const cal = Calories.estimateItem(item);
    card.querySelector('.item-cal span').textContent = cal + ' kcal';
    recalcTotal();
  }
  function recalcTotal() {
    $('mealTotal').textContent = Calories.mealTotal(currentItems) + ' kcal';
  }

  function addItem(kind) {
    const item = newItem(kind);
    currentItems.push(item);
    $('itemsContainer').appendChild(createItemCard(item));
    recalcTotal();
  }
  function removeItem(id) {
    currentItems = currentItems.filter(it => it.id !== id);
    const card = document.querySelector(`.item-card[data-id="${id}"]`);
    if (card) card.remove();
    recalcTotal();
  }

  function openModal(entry) {
    editingEntry = entry || null;
    $('foodModalTitle').textContent = entry ? 'Edit meal' : 'Add meal';
    $('saveFoodBtn').textContent = entry ? 'Update meal' : 'Save meal';
    $('mealName').value = entry?.name || '';
    $('foodNotes').value = entry?.notes || '';
    $('foodPhoto').value = '';
    currentPhoto = entry?.photo || null;

    currentItems = [];
    $('itemsContainer').innerHTML = '';

    let items;
    if (entry) {
      if (Array.isArray(entry.items) && entry.items.length) {
        items = entry.items.map(it => ({ ...newItem(it.kind || 'savory'), ...it, id: 'it' + (itemSeq++) }));
      } else {
        // old flat entry → manual item preserving its calories
        items = [{ id: 'it' + (itemSeq++), kind: 'manual', name: entry.name || 'Food', calories: entry.calories || 0 }];
      }
    } else {
      items = [newItem('savory')];
    }
    items.forEach(it => {
      currentItems.push(it);
      $('itemsContainer').appendChild(createItemCard(it));
    });
    recalcTotal();
    $('foodModal').hidden = false;
  }

  function saveFood() {
    if (currentItems.length === 0) { alert('Add at least one item.'); return; }
    let name = $('mealName').value.trim();
    if (!name) {
      const names = currentItems.map(it => (it.name || '').trim()).filter(Boolean);
      name = names.length ? names.join(' + ') : 'Meal';
    }
    const items = currentItems.map(it => ({
      kind: it.kind, name: (it.name || '').trim(), category: it.category,
      portion: it.portion, oil: it.oil, sauce: it.sauce, cooking: it.cooking,
      richness: it.richness, sweet: it.sweet, calories: Calories.estimateItem(it),
    }));
    const entry = {
      id: editingEntry ? editingEntry.id : Date.now(),
      date: editingEntry ? editingEntry.date : selectedDate,
      time: editingEntry ? (editingEntry.time || formatTime(new Date())) : formatTime(new Date()),
      name, items,
      calories: items.reduce((s, i) => s + i.calories, 0),
      photo: currentPhoto,
      notes: $('foodNotes').value.trim(),
    };
    Storage.saveFoodLog(entry);
    $('foodModal').hidden = true;
    render();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  function render() {
    renderCalendar();
    renderDayDetail();
  }

  return { init, render };
})();

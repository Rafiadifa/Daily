/* ----------------------------------------------------
   water.js
   Calendar view + day detail for water tracking.
   Quick-add buttons add to whatever day is selected
   (so you can backfill yesterday if you forgot).
----------------------------------------------------- */

const WaterTab = (() => {
  let selectedDate = formatDate(new Date());
  let viewMonth = new Date();
  const $ = (id) => document.getElementById(id);

  // Manual override if set, otherwise computed from body weight (~35 ml/kg)
  function waterGoal() {
    const manual = Storage.getSetting('waterGoal', null);
    if (manual) return manual;
    return Calories.waterTarget(Storage.getEffectiveWeight());
  }

  function init() {
    $('waterCalPrev').addEventListener('click', () => shiftMonth(-1));
    $('waterCalNext').addEventListener('click', () => shiftMonth(1));

    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const amount = parseInt(btn.dataset.amount);
        Storage.addWater(amount, selectedDate);
        render();
      });
    });

    $('addCustomWaterBtn').addEventListener('click', () => {
      const amt = parseInt($('customWater').value);
      if (!amt || amt < 1) return;
      Storage.addWater(amt, selectedDate);
      $('customWater').value = '';
      render();
    });

    $('editGoalBtn').addEventListener('click', () => {
      const current = waterGoal();
      const n = prompt('Daily water goal (ml):', current);
      if (n && !isNaN(parseInt(n))) {
        Storage.setSetting('waterGoal', parseInt(n));
        render();
      }
    });

    render();
  }

  function shiftMonth(delta) {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
    renderCalendar();
  }

  function selectDate(dateStr) {
    selectedDate = dateStr;
    renderCalendar();
    renderDayDetail();
  }

  function renderCalendar() {
    const grid = $('waterCalGrid');
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();
    const goal = waterGoal();

    $('waterCalMonth').textContent = monthLabel(viewMonth);

    const totals = Storage.getWaterTotalsByDate();
    const today = formatDate(new Date());

    let html = '';

    const prevMonthLast = new Date(year, month, 0).getDate();
    for (let i = firstWeekday - 1; i >= 0; i--) {
      html += `<div class="cal-cell off-month">
        <span class="day-num">${prevMonthLast - i}</span>
      </div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const ds = formatDate(date);
      const total = totals[ds] || 0;
      const tier = total === 0 ? '' :
        total < 1500 ? 'tier-water-low' :
        total < goal ? 'tier-water-mid' : 'tier-water-high';
      const cls = [
        'cal-cell',
        tier,
        ds === today ? 'today' : '',
        ds === selectedDate ? 'selected' : '',
      ].filter(Boolean).join(' ');
      html += `<div class="${cls}" data-date="${ds}">
        <span class="day-num">${day}</span>
        ${total > 0 ? `<span class="day-val">${total}</span>` : ''}
      </div>`;
    }

    const cellsSoFar = firstWeekday + daysInMonth;
    const trailing = (7 - (cellsSoFar % 7)) % 7;
    for (let i = 1; i <= trailing; i++) {
      html += `<div class="cal-cell off-month">
        <span class="day-num">${i}</span>
      </div>`;
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => selectDate(cell.dataset.date));
    });
  }

  function renderDayDetail() {
    $('waterDateLabel').textContent = prettyDate(selectedDate);

    const total = Storage.getWaterTotal(selectedDate);
    const goal = waterGoal();
    const pct = Math.min(100, Math.round((total / goal) * 100));

    $('waterToday').textContent = total;
    $('waterGoal').textContent = goal;
    $('waterFill').style.width = pct + '%';
    $('waterPercent').textContent = pct + '%';

    renderList();
  }

  function renderList() {
    const entries = Storage.getWater(selectedDate).slice().reverse();
    const list = $('waterList');
    if (entries.length === 0) {
      list.innerHTML = `<div class="empty-state">No water logged for this day yet.</div>`;
      return;
    }
    list.innerHTML = entries.map(e => `
      <div class="log-item">
        <div class="log-info">
          <div class="log-name" style="font-family:var(--font-mono);font-size:13px;">${e.time || '—'}</div>
        </div>
        <div class="log-cal" style="color:var(--water);">${e.amount}<small style="font-size:10px;font-family:var(--font-mono);color:var(--ink-faint);"> ml</small></div>
        <button class="log-delete" data-id="${e.id}">×</button>
      </div>
    `).join('');

    list.querySelectorAll('.log-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        Storage.deleteWater(parseInt(btn.dataset.id));
        render();
      });
    });
  }

  function render() {
    renderCalendar();
    renderDayDetail();
  }

  return { init, render };
})();

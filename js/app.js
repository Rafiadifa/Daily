/* ----------------------------------------------------
   app.js — coordinator
   Tabs (Day / Weight), modals, profile + eating window,
   export/import, backup nudge, service-worker registration.
----------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  // ----- Modal hide/show driven by the `hidden` attribute -----
  // Inline display always beats external CSS (cache-proof). We keep the
  // attribute intact so `.hidden = false` keeps firing the observer.
  document.querySelectorAll('.modal').forEach(modal => {
    const sync = () => { modal.style.display = modal.hasAttribute('hidden') ? 'none' : 'flex'; };
    sync();
    new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  });

  // ----- Tab switching -----
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + target).classList.add('active');
      if (target === 'day') Day.render();
      if (target === 'money') Money.render();
      if (target === 'weight') WeightTab.render();
    });
  });

  // ----- Modal close (buttons + backdrop) -----
  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => { $(el.dataset.close).hidden = true; });
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  });

  // ----- Export / backup -----
  function doExport() {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-log-${formatDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    Storage.setSetting('lastBackup', new Date().toISOString());
    refreshBackupBanner();
  }
  $('exportBtn').addEventListener('click', doExport);

  // ----- Import -----
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const mode = confirm(
        'Import data?\n\nOK = MERGE with existing data (keeps both)\nCancel = REPLACE all existing data (wipes current)'
      ) ? 'merge' : 'replace';
      if (mode === 'replace' && !confirm('Really replace all existing data? This cannot be undone.')) {
        e.target.value = ''; return;
      }
      Storage.importAll(data, mode);
      alert('Import complete!');
      Day.render();
      Money.render();
      WeightTab.render();
      refreshBackupBanner();
    } catch (err) {
      console.error(err);
      alert('Invalid file: ' + err.message);
    }
    e.target.value = '';
  });

  // ----- Backup nudge banner -----
  function refreshBackupBanner() {
    const banner = $('backupBanner');
    if (!banner) return;
    if (sessionStorage.getItem('backupDismissed')) { banner.hidden = true; return; }
    const hasData = Storage.getFoodLogs().length || Storage.getWeights().length || Storage.getWater().length;
    if (!hasData) { banner.hidden = true; return; }
    const last = Storage.getSetting('lastBackup', null);
    let overdue = false, txt = '';
    if (!last) {
      overdue = true;
      txt = "You haven't backed up yet — export a copy so a cache-clear can't wipe your data.";
    } else {
      const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
      if (days >= 7) { overdue = true; txt = `Last backup was ${days} days ago — worth exporting again.`; }
    }
    banner.hidden = !overdue;
    if (overdue) $('backupText').textContent = txt;
  }
  $('backupNowBtn').addEventListener('click', doExport);
  $('backupDismiss').addEventListener('click', () => {
    sessionStorage.setItem('backupDismissed', '1');
    $('backupBanner').hidden = true;
  });

  // ----- Profile modal (incl. eating window) -----
  const pf = (id) => document.getElementById(id);
  function loadProfileForm() {
    const p = Storage.getProfile();
    pf('pfHeight').value = p.height;
    pf('pfAge').value = p.age;
    pf('pfSex').value = p.sex;
    pf('pfActivity').value = p.activity;
    pf('pfGoal').value = p.goal;
    const w = Storage.getSetting('eatingWindow', { enabled: false, start: '06:30', end: '14:30' });
    pf('pfFastEnabled').checked = !!w.enabled;
    pf('pfFastStart').value = w.start || '06:30';
    pf('pfFastEnd').value = w.end || '14:30';
    const sec = Storage.getSetting('daySections', {});
    pf('pfSecBurned').checked = sec.burned !== false;
    pf('pfSecFasting').checked = sec.fasting !== false;
    pf('pfSecWater').checked = sec.water !== false;
    pf('pfSecReflection').checked = sec.reflection !== false;
    updateProfilePreview();
  }
  function readProfileForm() {
    return {
      height: parseFloat(pf('pfHeight').value) || 169,
      age: parseInt(pf('pfAge').value) || 20,
      sex: pf('pfSex').value,
      activity: pf('pfActivity').value,
      goal: pf('pfGoal').value,
    };
  }
  function updateProfilePreview() {
    const weight = Storage.getEffectiveWeight();
    const p = { ...readProfileForm(), weight };
    pf('pfBmr').textContent = Calories.bmr(p) + ' kcal';
    pf('pfTdee').textContent = Calories.tdee(p) + ' kcal';
    pf('pfTarget').textContent = Calories.calorieTarget(p) + ' kcal';
    pf('pfWater').textContent = Calories.waterTarget(weight) + ' ml';
  }
  pf('profileBtn').addEventListener('click', () => { loadProfileForm(); pf('profileModal').hidden = false; });
  ['pfHeight','pfAge','pfSex','pfActivity','pfGoal'].forEach(id => {
    pf(id).addEventListener('input', updateProfilePreview);
    pf(id).addEventListener('change', updateProfilePreview);
  });
  pf('saveProfileBtn').addEventListener('click', () => {
    Storage.setProfile(readProfileForm());
    Storage.setSetting('eatingWindow', {
      enabled: pf('pfFastEnabled').checked,
      start: pf('pfFastStart').value || '06:30',
      end: pf('pfFastEnd').value || '14:30',
    });
    Storage.setSetting('daySections', {
      burned: pf('pfSecBurned').checked,
      fasting: pf('pfSecFasting').checked,
      water: pf('pfSecWater').checked,
      reflection: pf('pfSecReflection').checked,
    });
    pf('profileModal').hidden = true;
    Day.render();
    WeightTab.render();
  });

  // ----- Init modules -----
  Day.init();
  Money.init();
  WeightTab.init();
  refreshBackupBanner();

  // ----- PWA service worker -----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed', err));
  }
});

/* ----------------------------------------------------
   storage.js
   localStorage wrapper. Designed so you can swap the
   implementation for Firebase/Supabase later without
   touching the rest of the app — keep the same method
   signatures.
----------------------------------------------------- */

const Storage = (() => {
  const KEYS = {
    food: 'dl_food_v1',
    weight: 'dl_weight_v1',
    water: 'dl_water_v1',
    settings: 'dl_settings_v1',
    daily: 'dl_daily_v1',     // per-day summary: burned cal + sport + note
    favorites: 'dl_favorites_v1',
  };

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('storage read failed', e);
      return fallback;
    }
  };
  const write = (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      alert('Storage is full. Try removing some old photos or exporting & clearing data.');
      console.error(e);
      return false;
    }
  };

  // ----- Food -----
  const getFoodLogs = (dateStr) => {
    const all = read(KEYS.food, []);
    return dateStr ? all.filter(e => e.date === dateStr) : all;
  };
  const addFoodLog = (entry) => {
    const all = read(KEYS.food, []);
    entry.id = entry.id || Date.now();
    all.push(entry);
    write(KEYS.food, all);
    return entry;
  };
  // Upsert: if entry.id matches an existing record, replace it; else add.
  const saveFoodLog = (entry) => {
    const all = read(KEYS.food, []);
    if (entry.id) {
      const idx = all.findIndex(e => e.id === entry.id);
      if (idx >= 0) { all[idx] = entry; write(KEYS.food, all); return entry; }
    }
    entry.id = entry.id || Date.now();
    all.push(entry);
    write(KEYS.food, all);
    return entry;
  };
  const deleteFoodLog = (id) => {
    const all = read(KEYS.food, []).filter(e => e.id !== id);
    write(KEYS.food, all);
  };
  const getFoodLogById = (id) => read(KEYS.food, []).find(e => e.id === id) || null;
  // Returns { '2026-05-27': totalCal, ... } for the entire month containing `date`
  const getFoodTotalsByDate = () => {
    const totals = {};
    read(KEYS.food, []).forEach(e => {
      totals[e.date] = (totals[e.date] || 0) + (e.calories || 0);
    });
    return totals;
  };

  // ----- Weight -----
  const getWeights = () => {
    return read(KEYS.weight, []).sort((a, b) => a.date.localeCompare(b.date));
  };
  const addWeight = (entry) => {
    const all = read(KEYS.weight, []);
    const idx = all.findIndex(e => e.date === entry.date);
    if (idx >= 0) all[idx] = entry;
    else all.push(entry);
    write(KEYS.weight, all);
    return entry;
  };
  const deleteWeight = (date) => {
    const all = read(KEYS.weight, []).filter(e => e.date !== date);
    write(KEYS.weight, all);
  };

  // ----- Water -----
  const getWater = (dateStr) => {
    const all = read(KEYS.water, []);
    return dateStr ? all.filter(e => e.date === dateStr) : all;
  };
  // amount: ml, dateStr: optional, defaults to today
  const addWater = (amount, dateStr) => {
    const all = read(KEYS.water, []);
    const date = dateStr || formatDate(new Date());
    all.push({ id: Date.now(), date, amount, time: formatTime(new Date()) });
    write(KEYS.water, all);
  };
  const deleteWater = (id) => {
    const all = read(KEYS.water, []).filter(e => e.id !== id);
    write(KEYS.water, all);
  };
  const updateWater = (id, patch) => {
    const all = read(KEYS.water, []);
    const idx = all.findIndex(e => e.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...patch }; write(KEYS.water, all); }
  };
  const getWaterTotal = (dateStr) => {
    return getWater(dateStr).reduce((sum, e) => sum + e.amount, 0);
  };
  const getWaterTotalsByDate = () => {
    const totals = {};
    read(KEYS.water, []).forEach(e => {
      totals[e.date] = (totals[e.date] || 0) + e.amount;
    });
    return totals;
  };

  // ----- Daily summary (burned cals + sport) -----
  const getDailySummary = (dateStr) => {
    const all = read(KEYS.daily, {});
    return all[dateStr] || { caloriesBurned: null, sport: 'none' };
  };
  const setDailySummary = (dateStr, patch) => {
    const all = read(KEYS.daily, {});
    all[dateStr] = { ...(all[dateStr] || {}), ...patch };
    write(KEYS.daily, all);
  };

  // ----- Settings -----
  const getSetting = (key, fallback) => {
    const s = read(KEYS.settings, {});
    return s[key] !== undefined ? s[key] : fallback;
  };
  const setSetting = (key, value) => {
    const s = read(KEYS.settings, {});
    s[key] = value;
    write(KEYS.settings, s);
  };

  // ----- Profile (body data for targets) -----
  const DEFAULT_PROFILE = {
    height: 169, age: 20, sex: 'male',
    activity: 'moderate', goal: 'maintain',
    weight: 68, // fallback only; real weight comes from latest weight log
  };
  const getProfile = () => {
    const p = read(KEYS.settings, {}).profile || {};
    return { ...DEFAULT_PROFILE, ...p };
  };
  const setProfile = (patch) => {
    const s = read(KEYS.settings, {});
    s.profile = { ...DEFAULT_PROFILE, ...(s.profile || {}), ...patch };
    write(KEYS.settings, s);
  };
  // Latest logged weight, or profile fallback
  const getEffectiveWeight = () => {
    const weights = read(KEYS.weight, []);
    if (weights.length) {
      const latest = weights.slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
      if (latest && latest.weight) return latest.weight;
    }
    return getProfile().weight;
  };

  // ----- Favorites (saved meals) -----
  const getFavorites = () => read(KEYS.favorites, []);
  const addFavorite = (fav) => {
    const all = read(KEYS.favorites, []);
    fav.id = fav.id || Date.now();
    // avoid exact-name duplicates
    if (!all.some(f => f.name === fav.name)) { all.push(fav); write(KEYS.favorites, all); }
    return fav;
  };
  const deleteFavorite = (id) => {
    write(KEYS.favorites, read(KEYS.favorites, []).filter(f => f.id !== id));
  };

  // ----- Export / Import -----
  const exportAll = () => {
    return {
      version: 4,
      exportedAt: new Date().toISOString(),
      food: read(KEYS.food, []),
      weight: read(KEYS.weight, []),
      water: read(KEYS.water, []),
      daily: read(KEYS.daily, {}),
      favorites: read(KEYS.favorites, []),
      settings: read(KEYS.settings, {}),
    };
  };
  const importAll = (data, mode = 'replace') => {
    if (!data || ![1, 2, 3, 4].includes(data.version)) {
      throw new Error('Invalid export file');
    }
    if (mode === 'merge') {
      const mergeArr = (existing, incoming, keyFn) => {
        const map = new Map();
        [...existing, ...incoming].forEach(e => map.set(keyFn(e), e));
        return [...map.values()];
      };
      write(KEYS.food, mergeArr(read(KEYS.food, []), data.food || [], e => e.id));
      write(KEYS.weight, mergeArr(read(KEYS.weight, []), data.weight || [], e => e.date));
      write(KEYS.water, mergeArr(read(KEYS.water, []), data.water || [], e => e.id));
      // daily is an object, merge by key
      const dailyMerged = { ...read(KEYS.daily, {}), ...(data.daily || {}) };
      write(KEYS.daily, dailyMerged);
      write(KEYS.favorites, mergeArr(read(KEYS.favorites, []), data.favorites || [], e => e.id));
    } else {
      write(KEYS.food, data.food || []);
      write(KEYS.weight, data.weight || []);
      write(KEYS.water, data.water || []);
      write(KEYS.daily, data.daily || {});
      write(KEYS.favorites, data.favorites || []);
      write(KEYS.settings, data.settings || {});
    }
  };

  return {
    getFoodLogs, addFoodLog, saveFoodLog, deleteFoodLog, getFoodLogById, getFoodTotalsByDate,
    getWeights, addWeight, deleteWeight,
    getWater, addWater, deleteWater, updateWater, getWaterTotal, getWaterTotalsByDate,
    getDailySummary, setDailySummary,
    getSetting, setSetting,
    getProfile, setProfile, getEffectiveWeight,
    getFavorites, addFavorite, deleteFavorite,
    exportAll, importAll,
  };
})();

// ----- Date helpers (used everywhere) -----
function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function formatTime(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
function prettyDate(dateStr) {
  const today = formatDate(new Date());
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (dateStr === today) return 'Today';
  if (dateStr === formatDate(yest)) return 'Yesterday';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function parseDate(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}
function monthLabel(d) {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// ----- Image helper: resize & compress to keep storage small -----
async function compressImage(file, maxSize = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

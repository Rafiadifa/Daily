/* ----------------------------------------------------
   calories.js
   Body-target math (BMR / TDEE / calorie + water targets).

   Food calories are no longer computed from a formula — you
   get the number from AI and type/paste it in. So an ITEM is
   now just { name, calories }; `estimateItem` simply returns
   the stored number, and a MEAL total is the sum of its items.
----------------------------------------------------- */

const Calories = (() => {
  // A food item now carries its calories directly (from AI / manual entry).
  function estimateItem(it) { return Math.round(Number(it && it.calories) || 0); }
  function mealTotal(items) { return (items || []).reduce((s, it) => s + estimateItem(it), 0); }
  function itemLabel(it) { return (it && it.name) || ''; }

  // ---- Body targets (Mifflin-St Jeor) ----
  const ACTIVITY_MULT = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  function bmr(p) {
    const v = 10 * p.weight + 6.25 * p.height - 5 * p.age;
    return Math.round(p.sex === 'female' ? v - 161 : v + 5);
  }
  function tdee(p) {
    return Math.round(bmr(p) * (ACTIVITY_MULT[p.activity] ?? 1.55));
  }
  function calorieTarget(p) {
    const t = tdee(p);
    if (p.goal === 'lose') return t - 400;
    if (p.goal === 'gain') return t + 300;
    return t;
  }
  function waterTarget(weightKg) {
    return Math.round((35 * weightKg) / 50) * 50; // nearest 50 ml
  }

  return { estimateItem, mealTotal, itemLabel, bmr, tdee, calorieTarget, waterTarget };
})();

/* app.js — Menu Costing & Pricing App (vanilla JS, no modules, works from file://) */
(function () {
  'use strict';

  /* =========================================================
     CONSTANTS
     ========================================================= */
  var STORAGE_KEY = 'menuCosting_v1';
  var DATA_VERSION = 1;

  var UNITS = {
    'g':     { family: 'weight', factor: 1 },
    'kg':    { family: 'weight', factor: 1000 },
    'oz':    { family: 'weight', factor: 28.349523125 },
    'lb':    { family: 'weight', factor: 453.59237 },
    'ml':    { family: 'volume', factor: 1 },
    'l':     { family: 'volume', factor: 1000 },
    'fl oz': { family: 'volume', factor: 29.5735295625 },
    'pcs':   { family: 'count',  factor: 1 }
  };
  var UNIT_ORDER = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl oz', 'pcs'];

  var CURRENCIES = [
    { code: 'USD', label: 'US Dollar (USD)', locale: 'en-US' },
    { code: 'EUR', label: 'Euro (EUR)', locale: 'de-DE' },
    { code: 'GBP', label: 'British Pound (GBP)', locale: 'en-GB' },
    { code: 'AUD', label: 'Australian Dollar (AUD)', locale: 'en-AU' },
    { code: 'CAD', label: 'Canadian Dollar (CAD)', locale: 'en-CA' },
    { code: 'SGD', label: 'Singapore Dollar (SGD)', locale: 'en-SG' },
    { code: 'MYR', label: 'Malaysian Ringgit (MYR)', locale: 'ms-MY' },
    { code: 'IDR', label: 'Indonesian Rupiah (IDR)', locale: 'id-ID' },
    { code: 'JPY', label: 'Japanese Yen (JPY)', locale: 'ja-JP' },
    { code: 'INR', label: 'Indian Rupee (INR)', locale: 'en-IN' }
  ];
  var ZERO_DECIMAL = ['IDR', 'JPY', 'KRW', 'VND'];

  function defaultStep(code) {
    if (code === 'IDR') return 500;
    if (code === 'JPY') return 10;
    if (code === 'KRW') return 100;
    if (code === 'VND') return 1000;
    return 0.1;
  }

  /* =========================================================
     HELPERS
     ========================================================= */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* Safe number parse: accepts "1.5" and "1,5"; returns null when empty/invalid */
  function num(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/\s/g, '');
    if (!s) return null;
    if (s.indexOf(',') > -1 && s.indexOf('.') === -1) s = s.replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function ok(n) { return typeof n === 'number' && isFinite(n); }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

  var ICON = {
    edit: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></svg>',
    copy: '<svg class="i" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    trash: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    plus: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    moon: '<svg class="i" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
    sun: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    warn: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.5"/></svg>'
  };

  /* =========================================================
     STATE
     ========================================================= */
  var state = null;
  var ui = { tab: 'menus', category: 'all', search: '', sort: 'name', ingSearch: '' };
  var menuDraft = null;     // menu being edited in the menu editor
  var ingDraft = null;      // ingredient being edited in the ingredient editor

  function findIng(id) { for (var i = 0; i < state.ingredients.length; i++) if (state.ingredients[i].id === id) return state.ingredients[i]; return null; }
  function findMenu(id) { for (var i = 0; i < state.menus.length; i++) if (state.menus[i].id === id) return state.menus[i]; return null; }
  function findCat(id) { for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i]; return null; }
  function catName(id) { var c = findCat(id); return c ? c.name : 'Uncategorized'; }

  /* =========================================================
     STORAGE
     ========================================================= */
  function load() {
    var data = null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (!validateData(parsed)) data = normalizeData(parsed);
      }
    } catch (e) { data = null; }
    state = data || normalizeData(clone(SAMPLE_DATA));
  }

  var savedTimer = null;
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      var el = $('#savedIndicator');
      el.textContent = 'Saved';
      el.classList.add('show');
      clearTimeout(savedTimer);
      savedTimer = setTimeout(function () { el.classList.remove('show'); }, 1600);
    } catch (e) {
      $('#savedIndicator').textContent = 'Not saved';
    }
  }

  /* =========================================================
     CURRENCY FORMATTING
     ========================================================= */
  var fmtCache = {};
  function currencyInfo() {
    for (var i = 0; i < CURRENCIES.length; i++) if (CURRENCIES[i].code === state.settings.currency) return CURRENCIES[i];
    return CURRENCIES[0];
  }
  function digits() { return ZERO_DECIMAL.indexOf(state.settings.currency) > -1 ? 0 : 2; }
  function formatter(extra) {
    var c = currencyInfo(), d = digits(), key = c.code + '|' + extra;
    if (!fmtCache[key]) {
      fmtCache[key] = new Intl.NumberFormat(c.locale, {
        style: 'currency', currency: c.code,
        minimumFractionDigits: d, maximumFractionDigits: d + extra
      });
    }
    return fmtCache[key];
  }
  function money(n) { return ok(n) ? formatter(0).format(n) : '—'; }
  function moneyFine(n) { return ok(n) ? formatter(2).format(n) : '—'; }
  function pct(n, dec) { return ok(n) ? n.toFixed(dec == null ? 1 : dec) + '%' : '—'; }
  function numStr(n) { return ok(n) ? String(Math.round(n * 1e6) / 1e6) : ''; }
  function priceStr(n) { return ok(n) ? n.toFixed(digits()) : ''; }

  /* =========================================================
     CALCULATIONS
     ========================================================= */
  function costPerBase(ing) {
    var u = UNITS[ing.unit];
    if (!u || !ok(ing.qty) || ing.qty <= 0 || !ok(ing.price)) return null;
    return ing.price / (ing.qty * u.factor);
  }
  function costPerPurchaseUnit(ing) {
    if (!ok(ing.qty) || ing.qty <= 0 || !ok(ing.price)) return null;
    return ing.price / ing.qty;
  }
  function lineCost(line) {
    var ing = findIng(line.ingredientId);
    if (!ing) return null;
    var lu = UNITS[line.unit], iu = UNITS[ing.unit];
    if (!lu || !iu || lu.family !== iu.family) return null;
    if (!ok(line.qty) || line.qty < 0) return null;
    var cpb = costPerBase(ing);
    if (cpb === null) return null;
    var w = ok(ing.waste) ? ing.waste : 0;
    if (w >= 100) return null;
    return cpb * line.qty * lu.factor / (1 - w / 100);
  }
  function overheadTotal() {
    return state.settings.overhead.reduce(function (s, o) { return s + (ok(o.amount) ? o.amount : 0); }, 0);
  }
  function overheadPerPortion() {
    if (!state.settings.includeOverhead) return 0;
    var p = state.settings.portionsPerMonth;
    if (!ok(p) || p <= 0) return 0;
    return overheadTotal() / p;
  }

  /* Round a raw price UP using integer minor units (no floating-point noise) */
  function roundPrice(raw) {
    if (!ok(raw) || raw < 0) return null;
    var d = digits(), scale = Math.pow(10, d);
    var minor = Math.ceil(Math.round(raw * scale * 1e6) / 1e6 - 1e-9);
    var ending = state.settings.priceEnding;
    if (d > 0 && ending === '99') {
      var c = Math.floor(minor / scale) * scale + (scale - 1);
      if (c < minor) c += scale;
      minor = c;
    } else if (d > 0 && ending === '49') {
      var base = Math.floor(minor / scale) * scale;
      var opts = [base + 49, base + 99, base + 149];
      for (var i = 0; i < opts.length; i++) { if (opts[i] >= minor) { minor = opts[i]; break; } }
    } else {
      var step = ok(state.settings.roundingStep) && state.settings.roundingStep > 0 ? state.settings.roundingStep : defaultStep(state.settings.currency);
      var stepMinor = Math.max(1, Math.round(step * scale));
      minor = Math.ceil(minor / stepMinor) * stepMinor;
    }
    return minor / scale;
  }
  function samePrice(a, b) { return ok(a) && ok(b) && Math.round(a * 100) === Math.round(b * 100); }

  function calcMenu(m) {
    var batch = 0, invalid = false;
    m.recipe.forEach(function (l) {
      var c = lineCost(l);
      if (c === null) invalid = true; else batch += c;
    });
    var portions = ok(m.portions) && m.portions >= 1 ? m.portions : null;
    var ingPP = portions ? batch / portions : null;
    var oh = overheadPerPortion();
    var hpp = ok(ingPP) ? ingPP + oh : null;
    var price = ok(m.price) && m.price > 0 ? m.price : null;
    var target = clamp(ok(state.settings.targetMargin) ? state.settings.targetMargin : 0, 0, 99) / 100;
    var r = {
      batch: batch, invalid: invalid, ingPP: ingPP, overhead: oh, hpp: hpp, price: price,
      profit: price !== null && hpp !== null ? price - hpp : null,
      margin: price !== null && hpp !== null ? (price - hpp) / price * 100 : null,
      foodCost: price !== null && hpp !== null ? hpp / price * 100 : null,
      suggested: hpp !== null ? roundPrice(hpp / (1 - target)) : null
    };
    var c = clamp(ok(state.settings.deliveryCommission) ? state.settings.deliveryCommission : 0, 0, 90) / 100;
    r.deliveryOn = c > 0;
    if (r.deliveryOn) {
      var dp = ok(m.deliveryPrice) && m.deliveryPrice > 0 ? m.deliveryPrice : null;
      r.deliveryPrice = dp;
      r.deliveryNet = dp !== null ? dp * (1 - c) : null;
      r.deliveryMargin = dp !== null && hpp !== null && r.deliveryNet > 0 ? (r.deliveryNet - hpp) / r.deliveryNet * 100 : null;
      r.suggestedDelivery = r.suggested !== null ? roundPrice(r.suggested / (1 - c)) : null;
    }
    r.status = marginStatus(r.margin);
    r.dStatus = marginStatus(r.deliveryMargin);
    return r;
  }
  function marginStatus(m) {
    if (!ok(m)) return 'none';
    var t = state.settings.targetMargin;
    if (m >= t) return 'good';
    if (m >= t - 10 && m >= 0) return 'warn';
    return 'bad';
  }
  function usageCount(ingId) {
    return state.menus.filter(function (m) { return m.recipe.some(function (l) { return l.ingredientId === ingId; }); });
  }

  /* =========================================================
     RENDERING — header, summary, tabs
     ========================================================= */
  function renderAll(opts) {
    opts = opts || {};
    applyTheme();
    $('#brandName').textContent = state.settings.businessName || 'My Business';
    document.title = (state.settings.businessName || 'Menu') + ' · Menu Costing';
    renderSummary();
    renderMenus();
    renderIngredients();
    if (!opts.skipSettings) renderSettings();
    else updateSettingsOutputs();
  }

  function renderSummary() {
    var calcs = state.menus.map(function (m) { return { m: m, c: calcMenu(m) }; });
    var withHpp = calcs.filter(function (x) { return ok(x.c.hpp); });
    var withMargin = calcs.filter(function (x) { return ok(x.c.margin); });
    var avgHpp = withHpp.length ? withHpp.reduce(function (s, x) { return s + x.c.hpp; }, 0) / withHpp.length : null;
    var avgMargin = withMargin.length ? withMargin.reduce(function (s, x) { return s + x.c.margin; }, 0) / withMargin.length : null;
    var best = withMargin.slice().sort(function (a, b) { return b.c.margin - a.c.margin; })[0];
    var below = withMargin.filter(function (x) { return x.c.margin < state.settings.targetMargin; }).length;
    $('#summary').innerHTML =
      tile('Menus', String(state.menus.length), state.categories.length + ' categories') +
      tile('Average HPP', money(avgHpp), 'per portion') +
      tile('Average margin', pct(avgMargin), 'target ' + state.settings.targetMargin + '%') +
      tile('Best margin', best ? pct(best.c.margin, 0) : '—', best ? esc(best.m.name) : 'no menus yet') +
      '<button type="button" class="tile tile-alert' + (below ? ' is-on' : '') + '" id="belowTile">' +
        '<span class="tile-label">' + (below ? ICON.warn : '') + 'Below target</span>' +
        '<span class="tile-value">' + below + '</span>' +
        '<span class="tile-sub">' + (below ? 'Show these menus' : 'All menus on target') + '</span></button>';
    $('#belowTile').addEventListener('click', function () {
      ui.sort = 'marginAsc'; ui.category = 'all'; ui.search = '';
      $('#menuSort').value = 'marginAsc'; $('#menuSearch').value = '';
      switchTab('menus'); renderMenus();
    });
  }
  function tile(label, value, sub) {
    return '<div class="tile"><span class="tile-label">' + label + '</span><span class="tile-value">' + value + '</span><span class="tile-sub">' + sub + '</span></div>';
  }

  function switchTab(tab) {
    ui.tab = tab;
    $all('.tab').forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.tab === tab)); });
    ['menus', 'ingredients', 'settings'].forEach(function (p) { $('#panel-' + p).hidden = p !== tab; });
  }

  /* =========================================================
     RENDERING — menus
     ========================================================= */
  function donut(pctVal, status) {
    var r = 20, c = 2 * Math.PI * r;
    var v = ok(pctVal) ? clamp(pctVal, 0, 100) : 0;
    var t = clamp(state.settings.targetMargin, 0, 100);
    var ta = (t / 100) * 2 * Math.PI - Math.PI / 2;
    var tx1 = 26 + Math.cos(ta) * 15, ty1 = 26 + Math.sin(ta) * 15, tx2 = 26 + Math.cos(ta) * 25, ty2 = 26 + Math.sin(ta) * 25;
    return '<div class="donut s-' + status + '" role="img" aria-label="Margin ' + pct(pctVal, 0) + '">' +
      '<svg viewBox="0 0 52 52" width="58" height="58"><circle cx="26" cy="26" r="' + r + '" class="donut-track"/>' +
      '<circle cx="26" cy="26" r="' + r + '" class="donut-fill" stroke-dasharray="' + (v / 100 * c).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 26 26)"/>' +
      '<line x1="' + tx1.toFixed(2) + '" y1="' + ty1.toFixed(2) + '" x2="' + tx2.toFixed(2) + '" y2="' + ty2.toFixed(2) + '" class="donut-target"/></svg>' +
      '<span class="donut-label">' + (ok(pctVal) ? Math.round(pctVal) + '%' : '—') + '</span></div>';
  }

  function sortMenus(list) {
    var s = ui.sort;
    return list.slice().sort(function (a, b) {
      if (s === 'name') return a.m.name.localeCompare(b.m.name);
      if (s === 'hpp') return (ok(b.c.hpp) ? b.c.hpp : -1) - (ok(a.c.hpp) ? a.c.hpp : -1);
      var am = ok(a.c.margin) ? a.c.margin : -9999, bm = ok(b.c.margin) ? b.c.margin : -9999;
      return s === 'marginDesc' ? bm - am : am - bm;
    });
  }

  function renderMenus() {
    var chips = '<button type="button" class="chip' + (ui.category === 'all' ? ' is-active' : '') + '" data-cat="all">All <span class="count">' + state.menus.length + '</span></button>';
    state.categories.forEach(function (c) {
      var n = state.menus.filter(function (m) { return m.categoryId === c.id; }).length;
      chips += '<button type="button" class="chip' + (ui.category === c.id ? ' is-active' : '') + '" data-cat="' + esc(c.id) + '">' + esc(c.name) + ' <span class="count">' + n + '</span></button>';
    });
    $('#categoryChips').innerHTML = chips;

    var q = ui.search.trim().toLowerCase();
    var cats = ui.category === 'all' ? state.categories : state.categories.filter(function (c) { return c.id === ui.category; });
    var html = '';
    cats.forEach(function (cat) {
      var list = state.menus.filter(function (m) { return m.categoryId === cat.id && (!q || m.name.toLowerCase().indexOf(q) > -1); })
        .map(function (m) { return { m: m, c: calcMenu(m) }; });
      if (q && !list.length) return;
      list = sortMenus(list);
      html += '<section class="group"><div class="group-head"><h2>' + esc(cat.name) + '</h2><span>' + list.length + (list.length === 1 ? ' item' : ' items') + '</span></div><div class="grid">';
      list.forEach(function (x) { html += menuCard(x.m, x.c); });
      if (!q) html += '<button type="button" class="add-card" data-add-cat="' + esc(cat.id) + '">' + ICON.plus + '<span>Add ' + esc(cat.name) + ' item</span></button>';
      html += '</div></section>';
    });
    if (!html) {
      html = q
        ? '<div class="empty"><p>No menus match “' + esc(ui.search) + '”.</p><button type="button" class="btn btn-quiet" id="clearSearch">Clear search</button></div>'
        : '<div class="empty"><p>Add a category in Costs &amp; Settings to start building your menu.</p></div>';
    }
    $('#menuGroups').innerHTML = html;
    var cs = $('#clearSearch');
    if (cs) cs.addEventListener('click', function () { ui.search = ''; $('#menuSearch').value = ''; renderMenus(); });
  }

  function menuCard(m, c) {
    var names = m.recipe.map(function (l) { var i = findIng(l.ingredientId); return i ? i.name : null; }).filter(Boolean);
    var ingText = names.slice(0, 4).join(', ') + (names.length > 4 ? ' +' + (names.length - 4) + ' more' : '');
    var below = ok(c.margin) && c.margin < state.settings.targetMargin;
    var onTarget = ok(c.margin) && c.margin >= state.settings.targetMargin;
    var showApply = ok(c.suggested) && !onTarget && !samePrice(c.suggested, m.price);
    var barW = ok(c.margin) ? clamp(c.margin, 0, 100) : 0;
    var h = '<article class="card s-' + c.status + '" data-id="' + esc(m.id) + '">';
    h += '<div class="card-top"><div><span class="cat-tag">' + esc(catName(m.categoryId)) + '</span>';
    if (m.portions > 1) h += '<span class="batch-tag">Batch of ' + m.portions + '</span>';
    h += '</div>' + (below ? '<span class="badge-below">' + ICON.warn + 'Below target</span>' : '') + '</div>';
    h += '<div class="card-head"><div class="card-name"><h3>' + esc(m.name) + '</h3><p class="card-ings">' + (ingText ? esc(ingText) : 'No ingredients yet') + '</p></div>' + donut(c.margin, c.status) + '</div>';
    if (c.invalid) h += '<p class="card-error">' + ICON.warn + 'A recipe line has a missing ingredient or wrong unit. Edit this menu to fix it.</p>';
    h += '<div class="hpp"><div><span class="mini-label">HPP per portion</span><span class="hpp-value">' + money(c.hpp) + '</span></div>' +
         '<dl class="breakdown"><div><dt>Ingredients</dt><dd>' + money(c.ingPP) + '</dd></div><div><dt>Overhead</dt><dd>' + money(c.overhead) + '</dd></div></dl></div>';
    h += '<div class="bar" aria-hidden="true"><span style="width:' + barW + '%"></span><i style="left:' + clamp(state.settings.targetMargin, 0, 100) + '%"></i></div>';
    h += '<div class="price-block"><label class="price-field"><span class="mini-label">Dine-in price</span>' +
         '<input type="number" inputmode="decimal" step="any" min="0" class="inline-price" data-field="price" data-id="' + esc(m.id) + '" value="' + priceStr(m.price) + '" aria-label="Dine-in price for ' + esc(m.name) + '"/></label>' +
         '<div class="price-meta"><span>Profit <b>' + money(c.profit) + '</b></span><span>Food cost <b>' + pct(c.foodCost) + '</b></span></div></div>';
    h += '<div class="suggest"><span>Suggested <b>' + money(c.suggested) + '</b></span>' +
         (showApply ? '<button type="button" class="link-btn" data-apply="price" data-id="' + esc(m.id) + '">Apply</button>' : (onTarget ? '<span class="on-target">On target</span>' : '')) + '</div>';
    if (c.deliveryOn) {
      h += '<div class="delivery s-' + c.dStatus + '"><label class="price-field"><span class="mini-label">Delivery price</span>' +
           '<input type="number" inputmode="decimal" step="any" min="0" class="inline-price" data-field="deliveryPrice" data-id="' + esc(m.id) + '" value="' + priceStr(m.deliveryPrice) + '" placeholder="' + (ok(c.suggestedDelivery) ? priceStr(c.suggestedDelivery) : '') + '" aria-label="Delivery price for ' + esc(m.name) + '"/></label>';
      if (ok(c.deliveryPrice)) {
        h += '<div class="price-meta"><span>Delivery margin <b class="m-' + c.dStatus + '">' + pct(c.deliveryMargin) + '</b></span><span>You receive <b>' + money(c.deliveryNet) + '</b></span></div>';
      } else {
        h += '<div class="price-meta"><span>Suggested <b>' + money(c.suggestedDelivery) + '</b></span>' +
             (ok(c.suggestedDelivery) ? '<button type="button" class="link-btn" data-apply="deliveryPrice" data-id="' + esc(m.id) + '">Apply</button>' : '') + '</div>';
      }
      h += '</div>';
    }
    h += '<div class="card-actions">' +
         '<button type="button" class="act" data-act="edit" data-id="' + esc(m.id) + '">' + ICON.edit + 'Edit</button>' +
         '<button type="button" class="act" data-act="dup" data-id="' + esc(m.id) + '">' + ICON.copy + 'Duplicate</button>' +
         '<button type="button" class="act act-danger" data-act="del" data-id="' + esc(m.id) + '">' + ICON.trash + 'Delete</button></div>';
    return h + '</article>';
  }

  /* =========================================================
     RENDERING — ingredients
     ========================================================= */
  function renderIngredients() {
    var q = ui.ingSearch.trim().toLowerCase();
    var list = state.ingredients.filter(function (i) { return !q || i.name.toLowerCase().indexOf(q) > -1; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    var h = '<thead><tr><th>Ingredient</th><th>Package</th><th class="num">Purchase price</th><th class="num">Waste</th><th class="num">Cost per unit</th><th class="num">Used in</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>';
    if (!list.length) {
      h += '<tr><td colspan="7" class="empty-cell">' + (q ? 'No ingredients match “' + esc(ui.ingSearch) + '”.' : 'No ingredients yet. Add your first one to start costing recipes.') + '</td></tr>';
    }
    list.forEach(function (i) {
      var used = usageCount(i.id).length;
      h += '<tr><td><span class="ing-name">' + esc(i.name) + '</span>' + (i.note ? '<span class="ing-note">' + esc(i.note) + '</span>' : '') + '</td>' +
        '<td>' + esc(numStr(i.qty)) + ' ' + esc(i.unit) + '</td>' +
        '<td class="num">' + money(i.price) + '</td>' +
        '<td class="num">' + (i.waste ? pct(i.waste, 0) : '—') + '</td>' +
        '<td class="num">' + moneyFine(costPerPurchaseUnit(i)) + ' <span class="per">/ ' + esc(i.unit) + '</span></td>' +
        '<td class="num">' + used + (used === 1 ? ' menu' : ' menus') + '</td>' +
        '<td class="row-actions"><button type="button" class="act" data-ing-act="edit" data-id="' + esc(i.id) + '">' + ICON.edit + 'Edit</button>' +
        '<button type="button" class="act act-danger" data-ing-act="del" data-id="' + esc(i.id) + '">' + ICON.trash + 'Delete</button></td></tr>';
    });
    $('#ingredientTable').innerHTML = h + '</tbody>';
  }

  /* =========================================================
     RENDERING — settings
     ========================================================= */
  function renderSettings() {
    var s = state.settings, zero = digits() === 0;
    var h = '';
    h += '<section class="set-block"><h2>Business</h2><div class="form-grid">' +
      field('Business name', '<input type="text" id="setName" value="' + esc(s.businessName) + '" maxlength="60"/>') +
      field('Theme', '<select id="setTheme"><option value="system"' + sel(s.theme, 'system') + '>Follow system</option><option value="light"' + sel(s.theme, 'light') + '>Light</option><option value="dark"' + sel(s.theme, 'dark') + '>Dark</option></select>') +
      '</div></section>';

    h += '<section class="set-block"><h2>Pricing</h2><div class="form-grid">' +
      field('Currency', '<select id="setCurrency">' + CURRENCIES.map(function (c) { return '<option value="' + c.code + '"' + sel(s.currency, c.code) + '>' + c.label + '</option>'; }).join('') + '</select>', 'Changes formatting only. Prices are not converted.') +
      field('Target margin (%)', '<input type="number" id="setTarget" min="0" max="95" step="any" value="' + numStr(s.targetMargin) + '"/>') +
      field('Rounding step', '<input type="number" id="setStep" min="0" step="any" value="' + numStr(s.roundingStep) + '"/>', 'Suggested prices round up to this step.') +
      (zero ? '' : field('Price ending', '<select id="setEnding"><option value="step"' + sel(s.priceEnding, 'step') + '>Round to step</option><option value="99"' + sel(s.priceEnding, '99') + '>End in .99</option><option value="49"' + sel(s.priceEnding, '49') + '>End in .49 or .99</option></select>')) +
      field('Delivery commission (%)', '<input type="number" id="setCommission" min="0" max="90" step="any" value="' + numStr(s.deliveryCommission) + '"/>', 'Set to 0 if you don’t sell on delivery apps.') +
      '</div></section>';

    h += '<section class="set-block"><h2>Overhead</h2>' +
      '<label class="switch"><input type="checkbox" id="setIncludeOh"' + (s.includeOverhead ? ' checked' : '') + '/><span class="switch-ui" aria-hidden="true"></span><span>Include overhead in HPP</span></label>' +
      '<div class="oh-list' + (s.includeOverhead ? '' : ' is-off') + '">';
    s.overhead.forEach(function (o) {
      h += '<div class="oh-row"><label class="sr-only" for="oh-n-' + esc(o.id) + '">Cost name</label><input type="text" id="oh-n-' + esc(o.id) + '" data-oh-name="' + esc(o.id) + '" value="' + esc(o.name) + '" placeholder="Cost name"/>' +
        '<label class="sr-only" for="oh-a-' + esc(o.id) + '">Monthly amount</label><input type="number" min="0" step="any" id="oh-a-' + esc(o.id) + '" data-oh-amount="' + esc(o.id) + '" value="' + numStr(o.amount) + '" placeholder="Per month"/>' +
        '<button type="button" class="btn btn-quiet btn-icon" data-oh-del="' + esc(o.id) + '" aria-label="Remove ' + esc(o.name) + '">' + ICON.x + '</button></div>';
    });
    h += '<button type="button" class="btn btn-quiet" id="addOhBtn">' + ICON.plus + 'Add cost</button>' +
      '<div class="form-grid">' + field('Estimated portions sold per month', '<input type="number" id="setPortions" min="0" step="1" value="' + numStr(s.portionsPerMonth) + '"/>') +
      '<div class="oh-result"><span class="mini-label">Monthly total</span><b id="ohTotal"></b><span class="mini-label">Overhead per portion</span><b id="ohPer"></b></div></div>' +
      '</div></section>';

    h += '<section class="set-block"><h2>Categories</h2><div class="cat-list">';
    state.categories.forEach(function (c) {
      var n = state.menus.filter(function (m) { return m.categoryId === c.id; }).length;
      h += '<div class="cat-row"><label class="sr-only" for="cat-' + esc(c.id) + '">Category name</label><input type="text" id="cat-' + esc(c.id) + '" data-cat-name="' + esc(c.id) + '" value="' + esc(c.name) + '" maxlength="40"/>' +
        '<span class="cat-count">' + n + (n === 1 ? ' menu' : ' menus') + '</span>' +
        '<button type="button" class="btn btn-quiet btn-icon" data-cat-del="' + esc(c.id) + '" aria-label="Delete category ' + esc(c.name) + '"' + (state.categories.length <= 1 ? ' disabled' : '') + '>' + ICON.trash + '</button></div>';
    });
    h += '</div><button type="button" class="btn btn-quiet" id="addCatBtn">' + ICON.plus + 'Add category</button></section>';

    h += '<section class="set-block"><h2>Data</h2>' +
      '<p class="note">Your data is saved in this browser only. Export a backup regularly, especially before clearing your browser or switching devices.</p>' +
      '<div class="data-actions">' +
      '<button type="button" class="btn btn-primary" id="exportJsonBtn">Export backup</button>' +
      '<button type="button" class="btn btn-quiet" id="importJsonBtn">Import backup</button>' +
      '<button type="button" class="btn btn-quiet" id="exportCsvBtn">Export CSV</button>' +
      '<button type="button" class="btn btn-quiet" id="sampleBtn">Load sample data</button>' +
      '<button type="button" class="btn btn-danger" id="clearBtn">Clear all data</button>' +
      '</div></section>';
    $('#settingsPanel').innerHTML = h;
    updateSettingsOutputs();
  }
  function field(label, control, hint) {
    var idm = control.match(/id="([^"]+)"/);
    return '<div class="field"><label' + (idm ? ' for="' + idm[1] + '"' : '') + '>' + label + '</label>' + control + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
  }
  function sel(a, b) { return a === b ? ' selected' : ''; }
  function updateSettingsOutputs() {
    var t = $('#ohTotal'), p = $('#ohPer');
    if (!t) return;
    t.textContent = money(overheadTotal());
    var ppm = state.settings.portionsPerMonth;
    p.textContent = ok(ppm) && ppm > 0 ? moneyFine(overheadTotal() / ppm) : 'Enter portions per month';
    var list = $('.oh-list');
    if (list) list.classList.toggle('is-off', !state.settings.includeOverhead);
  }

  /* =========================================================
     THEME
     ========================================================= */
  function effectiveDark() {
    var t = state.settings.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    $('#themeBtn').innerHTML = effectiveDark() ? ICON.sun : ICON.moon;
    $('#themeBtn').setAttribute('aria-label', effectiveDark() ? 'Switch to light mode' : 'Switch to dark mode');
  }

  /* =========================================================
     DIALOGS (overlays, confirm, toast)
     ========================================================= */
  var lastFocus = [];
  function openOverlay(id) {
    lastFocus.push(document.activeElement);
    var o = $('#' + id);
    o.hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(function () {
      var f = o.querySelector('.dialog-body input, .dialog-body select, .dialog-body button, #askOk');
      if (f) f.focus();
    }, 30);
  }
  function closeOverlay(id) {
    $('#' + id).hidden = true;
    if (!$all('.overlay').some(function (o) { return !o.hidden; })) document.body.classList.remove('no-scroll');
    var f = lastFocus.pop();
    if (f && f.focus && document.contains(f)) f.focus();
  }

  var askResolve = null;
  /* ask({title, html, okText, danger, collect(body) -> value | false}) -> Promise(value|null) */
  function ask(opts) {
    $('#askTitle').textContent = opts.title;
    $('#askBody').innerHTML = opts.html;
    var okBtn = $('#askOk');
    okBtn.textContent = opts.okText || 'OK';
    okBtn.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
    $('#askCancel').hidden = !!opts.noCancel;
    openOverlay('askModal');
    return new Promise(function (resolve) {
      askResolve = function (confirmed) {
        var val = null;
        if (confirmed) {
          val = opts.collect ? opts.collect($('#askBody')) : true;
          if (val === false) return;
        }
        askResolve = null;
        closeOverlay('askModal');
        resolve(confirmed ? val : null);
      };
    });
  }
  $('#askOk').addEventListener('click', function () { if (askResolve) askResolve(true); });
  $('#askCancel').addEventListener('click', function () { if (askResolve) askResolve(false); });

  var toastTimer = null;
  function toast(msg, type) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' toast-' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2800);
  }

  /* =========================================================
     MENU EDITOR
     ========================================================= */
  function defaultRecipeUnit(ing) {
    if (!ing) return 'g';
    if (ing.unit === 'fl oz') return 'fl oz';
    var f = UNITS[ing.unit] ? UNITS[ing.unit].family : 'weight';
    return f === 'weight' ? 'g' : f === 'volume' ? 'ml' : 'pcs';
  }

  function openMenuEditor(id, catId) {
    var m = id ? findMenu(id) : null;
    menuDraft = m ? clone(m) : {
      id: null, name: '', categoryId: catId || (ui.category !== 'all' ? ui.category : (state.categories[0] ? state.categories[0].id : '')),
      portions: 1, price: null, deliveryPrice: null, recipe: [{ ingredientId: '', qty: null, unit: 'g', _text: '' }]
    };
    menuDraft.recipe.forEach(function (l) { var i = findIng(l.ingredientId); l._text = i ? i.name : (l._text || ''); });
    $('#menuModalTitle').textContent = m ? 'Edit menu' : 'Add menu';
    renderMenuEditor();
    openOverlay('menuModal');
  }

  function renderMenuEditor() {
    var d = menuDraft, deliveryOn = (state.settings.deliveryCommission || 0) > 0;
    if (!state.categories.length) {
      $('#menuModalBody').innerHTML = '<p class="note">Add a category in Costs &amp; Settings first.</p>';
      return;
    }
    var h = '<div class="form-grid">' +
      field('Menu name', '<input type="text" id="mName" maxlength="60" value="' + esc(d.name) + '" placeholder="e.g. Iced Vanilla Latte"/>') +
      field('Category', '<select id="mCat">' + state.categories.map(function (c) { return '<option value="' + esc(c.id) + '"' + sel(d.categoryId, c.id) + '>' + esc(c.name) + '</option>'; }).join('') + '</select>') +
      field('Portions per recipe', '<input type="number" id="mPortions" min="1" step="1" value="' + numStr(d.portions) + '"/>', 'Use more than 1 for batch recipes, e.g. a tray of 12.') +
      field('Dine-in price', '<input type="number" id="mPrice" min="0" step="any" value="' + priceStr(d.price) + '" placeholder="Empty = suggested"/>') +
      (deliveryOn ? field('Delivery price', '<input type="number" id="mDelivery" min="0" step="any" value="' + priceStr(d.deliveryPrice) + '" placeholder="Optional"/>') : '') +
      '</div>';
    h += '<div class="recipe"><div class="recipe-head"><h3>Recipe</h3><span class="hint">Quantities are for the whole recipe.</span></div>' +
      '<datalist id="ingList">' + state.ingredients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (i) { return '<option value="' + esc(i.name) + '"></option>'; }).join('') + '</datalist>' +
      '<div class="recipe-lines" id="recipeLines"></div>' +
      '<div class="recipe-actions"><button type="button" class="btn btn-quiet" id="addLineBtn">' + ICON.plus + 'Add line</button>' +
      '<button type="button" class="btn btn-quiet" id="newIngBtn">' + ICON.plus + 'New ingredient</button></div></div>' +
      '<div class="live" id="menuLive" aria-live="polite"></div>';
    $('#menuModalBody').innerHTML = h;
    renderRecipeLines();
    updateMenuLive();
  }

  function renderRecipeLines() {
    var h = '';
    menuDraft.recipe.forEach(function (l, idx) {
      var ing = findIng(l.ingredientId);
      var fam = ing && UNITS[ing.unit] ? UNITS[ing.unit].family : null;
      var units = fam ? UNIT_ORDER.filter(function (u) { return UNITS[u].family === fam; }) : UNIT_ORDER;
      if (fam && units.indexOf(l.unit) === -1) l.unit = defaultRecipeUnit(ing);
      var cost = lineCost(l);
      h += '<div class="line" data-idx="' + idx + '">' +
        '<div class="line-ing"><label class="sr-only" for="li-' + idx + '">Ingredient</label><input type="text" id="li-' + idx + '" list="ingList" data-line-ing="' + idx + '" value="' + esc(l._text) + '" placeholder="Type to search ingredients" autocomplete="off"' + (l._text && !ing ? ' aria-invalid="true"' : '') + '/></div>' +
        '<div class="line-qty"><label class="sr-only" for="lq-' + idx + '">Quantity</label><input type="number" id="lq-' + idx + '" min="0" step="any" data-line-qty="' + idx + '" value="' + numStr(l.qty) + '" placeholder="Qty"/></div>' +
        '<div class="line-unit"><label class="sr-only" for="lu-' + idx + '">Unit</label><select id="lu-' + idx + '" data-line-unit="' + idx + '"' + (fam ? '' : ' disabled') + '>' + units.map(function (u) { return '<option' + sel(l.unit, u) + '>' + u + '</option>'; }).join('') + '</select></div>' +
        '<div class="line-cost" data-line-cost="' + idx + '">' + (cost !== null ? moneyFine(cost) : '—') + '</div>' +
        '<button type="button" class="btn btn-quiet btn-icon" data-line-del="' + idx + '" aria-label="Remove line">' + ICON.x + '</button>' +
        '<p class="line-error"' + (l._text && !ing ? '' : ' hidden') + '>Pick an ingredient from the list, or create it with “New ingredient”.</p>' +
        '</div>';
    });
    if (!menuDraft.recipe.length) h = '<p class="note">No recipe lines yet. Add a line to start.</p>';
    $('#recipeLines').innerHTML = h;
  }

  /* Update one recipe row in place (keeps focus; never replaces the text input) */
  function updateLineRow(idx) {
    var l = menuDraft.recipe[idx], row = $('.line[data-idx="' + idx + '"]');
    if (!l || !row) return;
    var ing = findIng(l.ingredientId);
    var fam = ing && UNITS[ing.unit] ? UNITS[ing.unit].family : null;
    var units = fam ? UNIT_ORDER.filter(function (u) { return UNITS[u].family === fam; }) : UNIT_ORDER;
    if (fam && units.indexOf(l.unit) === -1) l.unit = defaultRecipeUnit(ing);
    var unitSel = row.querySelector('[data-line-unit]');
    var wanted = units.join('|') + '#' + l.unit + '#' + !!fam;
    if (unitSel.dataset.state !== wanted) {
      unitSel.innerHTML = units.map(function (u) { return '<option' + sel(l.unit, u) + '>' + u + '</option>'; }).join('');
      unitSel.disabled = !fam;
      unitSel.dataset.state = wanted;
    }
    var bad = !!(l._text && !ing);
    var input = row.querySelector('[data-line-ing]');
    if (bad) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    row.querySelector('.line-error').hidden = !bad;
  }

  function updateLineRowQuiet(idx) {
    var l = menuDraft.recipe[idx], row = $('.line[data-idx="' + idx + '"]');
    if (!row) return;
    updateLineRow(idx);
    if (!l.ingredientId) { row.querySelector('.line-error').hidden = true; row.querySelector('[data-line-ing]').removeAttribute('aria-invalid'); }
  }

  function readMenuForm() {
    var d = menuDraft;
    d.name = $('#mName').value;
    d.categoryId = $('#mCat').value;
    d.portions = num($('#mPortions').value);
    d.price = num($('#mPrice').value);
    var del = $('#mDelivery');
    if (del) d.deliveryPrice = num(del.value);
  }

  function updateMenuLive() {
    if (!$('#mName')) return;
    readMenuForm();
    menuDraft.recipe.forEach(function (l, idx) {
      var el = $('[data-line-cost="' + idx + '"]');
      if (el) { var c = lineCost(l); el.textContent = c !== null ? moneyFine(c) : '—'; }
    });
    var c = calcMenu(menuDraft);
    var h = '<div class="live-grid">' +
      liveItem('Batch cost', money(c.batch)) +
      liveItem('Ingredients per portion', money(c.ingPP)) +
      liveItem('Overhead per portion', money(c.overhead)) +
      liveItem('HPP per portion', money(c.hpp), 'strong') +
      liveItem('Suggested price', money(c.suggested), 'accent') +
      liveItem('Margin at your price', ok(c.margin) ? '<span class="m-' + c.status + '">' + pct(c.margin) + '</span>' : 'Enter a price') +
      (c.deliveryOn ? liveItem('Suggested delivery', money(c.suggestedDelivery)) : '') +
      '</div>';
    if (ok(c.suggested) && !samePrice(c.suggested, menuDraft.price)) h += '<button type="button" class="link-btn" id="useSuggested">Use suggested price</button>';
    $('#menuLive').innerHTML = h;
  }
  function liveItem(label, value, cls) { return '<div class="live-item' + (cls ? ' ' + cls : '') + '"><span class="mini-label">' + label + '</span><b>' + value + '</b></div>'; }

  function resolveLineIngredient(idx, text) {
    var l = menuDraft.recipe[idx];
    l._text = text;
    var t = text.trim().toLowerCase();
    var match = state.ingredients.filter(function (i) { return i.name.trim().toLowerCase() === t; })[0];
    if (match) {
      var changed = l.ingredientId !== match.id;
      l.ingredientId = match.id;
      l._text = match.name;
      if (changed) l.unit = defaultRecipeUnit(match);
    } else {
      l.ingredientId = '';
    }
  }

  function saveMenu() {
    readMenuForm();
    var d = menuDraft;
    var name = d.name.trim();
    if (!name) return toast('Enter a menu name.', 'error');
    if (!findCat(d.categoryId)) return toast('Choose a category.', 'error');
    if (!ok(d.portions) || d.portions < 1 || Math.floor(d.portions) !== d.portions) return toast('Portions per recipe must be a whole number of 1 or more.', 'error');
    var lines = d.recipe.filter(function (l) { return l._text.trim() || l.ingredientId || ok(l.qty); });
    if (!lines.length) return toast('Add at least one recipe line.', 'error');
    for (var i = 0; i < lines.length; i++) {
      if (!findIng(lines[i].ingredientId)) return toast('Line ' + (i + 1) + ': pick an ingredient from the list.', 'error');
      if (!ok(lines[i].qty) || lines[i].qty <= 0) return toast('Line ' + (i + 1) + ': enter a quantity above 0.', 'error');
    }
    if ((ok(d.price) && d.price < 0) || (ok(d.deliveryPrice) && d.deliveryPrice < 0)) return toast('Prices can’t be negative.', 'error');
    var clean = {
      id: d.id || uid('m'), name: name, categoryId: d.categoryId, portions: d.portions,
      price: ok(d.price) && d.price > 0 ? d.price : null,
      deliveryPrice: ok(d.deliveryPrice) && d.deliveryPrice > 0 ? d.deliveryPrice : null,
      recipe: lines.map(function (l) { return { ingredientId: l.ingredientId, qty: l.qty, unit: l.unit }; })
    };
    if (clean.price === null) clean.price = calcMenu(clean).suggested;
    var existing = d.id ? state.menus.findIndex(function (m) { return m.id === d.id; }) : -1;
    if (existing > -1) state.menus[existing] = clean; else state.menus.push(clean);
    closeOverlay('menuModal');
    menuDraft = null;
    save(); renderAll({ skipSettings: true });
    toast(existing > -1 ? 'Menu updated' : 'Menu added');
  }

  /* menu editor events (delegated) */
  $('#menuModalBody').addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.lineQty !== undefined) menuDraft.recipe[+t.dataset.lineQty].qty = num(t.value);
    if (t.dataset.lineIng !== undefined) {
      var idx = +t.dataset.lineIng;
      resolveLineIngredient(idx, t.value);
      updateLineRowQuiet(idx);
    }
    updateMenuLive();
  });
  $('#menuModalBody').addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.lineUnit !== undefined) menuDraft.recipe[+t.dataset.lineUnit].unit = t.value;
    if (t.dataset.lineIng !== undefined) {
      var i2 = +t.dataset.lineIng;
      resolveLineIngredient(i2, t.value);
      if (menuDraft.recipe[i2].ingredientId) t.value = menuDraft.recipe[i2]._text;
      updateLineRow(i2);
    }
    updateMenuLive();
  });
  $('#menuModalBody').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'addLineBtn') {
      readMenuForm();
      menuDraft.recipe.push({ ingredientId: '', qty: null, unit: 'g', _text: '' });
      renderRecipeLines(); updateMenuLive();
      var last = $('#li-' + (menuDraft.recipe.length - 1)); if (last) last.focus();
    } else if (b.dataset.lineDel !== undefined) {
      readMenuForm();
      menuDraft.recipe.splice(+b.dataset.lineDel, 1);
      renderRecipeLines(); updateMenuLive();
    } else if (b.id === 'newIngBtn') {
      readMenuForm();
      openIngredientEditor(null, true);
    } else if (b.id === 'useSuggested') {
      var c = calcMenu(menuDraft);
      $('#mPrice').value = priceStr(c.suggested);
      updateMenuLive();
    }
  });
  $('#menuSaveBtn').addEventListener('click', saveMenu);

  /* =========================================================
     INGREDIENT EDITOR
     ========================================================= */
  function openIngredientEditor(id, fromMenu) {
    var i = id ? findIng(id) : null;
    ingDraft = i ? clone(i) : { id: null, name: '', qty: null, unit: state.settings.currency === 'USD' ? 'lb' : 'kg', price: null, waste: 0, note: '' };
    ingDraft._fromMenu = !!fromMenu;
    $('#ingredientModalTitle').textContent = i ? 'Edit ingredient' : 'Add ingredient';
    var used = i ? usageCount(i.id).length : 0;
    $('#ingredientModalBody').innerHTML = '<div class="form-grid">' +
      field('Ingredient name', '<input type="text" id="iName" maxlength="60" value="' + esc(ingDraft.name) + '" placeholder="e.g. Whole milk"/>') +
      field('Purchase quantity', '<input type="number" id="iQty" min="0" step="any" value="' + numStr(ingDraft.qty) + '" placeholder="e.g. 1"/>', 'The size of the pack you buy.') +
      field('Purchase unit', '<select id="iUnit">' + UNIT_ORDER.map(function (u) { return '<option' + sel(ingDraft.unit, u) + '>' + u + '</option>'; }).join('') + '</select>' + (used ? '' : '')) +
      field('Purchase price', '<input type="number" id="iPrice" min="0" step="any" value="' + numStr(ingDraft.price) + '" placeholder="Price for the whole pack"/>') +
      field('Waste (%)', '<input type="number" id="iWaste" min="0" max="90" step="any" value="' + numStr(ingDraft.waste) + '"/>', 'Peel, trim, spills. Recipe cost is raised to cover it.') +
      field('Note', '<input type="text" id="iNote" maxlength="80" value="' + esc(ingDraft.note) + '" placeholder="Optional, e.g. supplier"/>') +
      '</div><div class="live" id="ingLive" aria-live="polite"></div>' +
      (used ? '<p class="note">Used in ' + used + (used === 1 ? ' menu' : ' menus') + '. Changes update them instantly. Changing the unit family (e.g. weight to pieces) will flag those recipe lines for review.</p>' : '');
    updateIngLive();
    openOverlay('ingredientModal');
  }
  function readIngForm() {
    ingDraft.name = $('#iName').value;
    ingDraft.qty = num($('#iQty').value);
    ingDraft.unit = $('#iUnit').value;
    ingDraft.price = num($('#iPrice').value);
    ingDraft.waste = num($('#iWaste').value) || 0;
    ingDraft.note = $('#iNote').value;
  }
  function updateIngLive() {
    readIngForm();
    var c = costPerPurchaseUnit(ingDraft);
    $('#ingLive').innerHTML = '<div class="live-grid">' +
      liveItem('Cost per ' + esc(ingDraft.unit), moneyFine(c)) +
      liveItem('Cost per ' + esc(ingDraft.unit) + ' incl. waste', ok(c) && ingDraft.waste < 100 ? moneyFine(c / (1 - clamp(ingDraft.waste, 0, 90) / 100)) : '—') +
      '</div>';
  }
  $('#ingredientModalBody').addEventListener('input', updateIngLive);
  $('#ingredientModalBody').addEventListener('change', updateIngLive);
  $('#ingredientSaveBtn').addEventListener('click', function () {
    readIngForm();
    var d = ingDraft, name = d.name.trim();
    if (!name) return toast('Enter an ingredient name.', 'error');
    var dup = state.ingredients.filter(function (i) { return i.id !== d.id && i.name.trim().toLowerCase() === name.toLowerCase(); })[0];
    if (dup) return toast('An ingredient named “' + dup.name + '” already exists.', 'error');
    if (!ok(d.qty) || d.qty <= 0) return toast('Enter a purchase quantity above 0.', 'error');
    if (!ok(d.price) || d.price < 0) return toast('Enter a purchase price of 0 or more.', 'error');
    if (!ok(d.waste) || d.waste < 0 || d.waste > 90) return toast('Waste must be between 0 and 90%.', 'error');
    var clean = { id: d.id || uid('ing'), name: name, qty: d.qty, unit: d.unit, price: d.price, waste: d.waste, note: d.note.trim() };
    var idx = d.id ? state.ingredients.findIndex(function (i) { return i.id === d.id; }) : -1;
    if (idx > -1) state.ingredients[idx] = clean; else state.ingredients.push(clean);
    var fromMenu = d._fromMenu;
    closeOverlay('ingredientModal');
    ingDraft = null;
    save(); renderAll({ skipSettings: true });
    toast(idx > -1 ? 'Ingredient updated' : 'Ingredient added');
    if (fromMenu && menuDraft) {
      var empty = menuDraft.recipe.filter(function (l) { return !l.ingredientId && !l._text.trim(); })[0];
      var line = empty || { ingredientId: '', qty: null, unit: 'g', _text: '' };
      line.ingredientId = clean.id; line._text = clean.name; line.unit = defaultRecipeUnit(clean);
      if (!empty) menuDraft.recipe.push(line);
      renderMenuEditor();
      var qi = menuDraft.recipe.indexOf(line);
      var q = $('#lq-' + qi); if (q) q.focus();
    }
  });

  /* =========================================================
     MAIN EVENTS
     ========================================================= */
  $all('.tab').forEach(function (t) { t.addEventListener('click', function () { switchTab(t.dataset.tab); }); });
  $('.tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var tabs = $all('.tab'), i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus(); switchTab(n.dataset.tab);
  });

  $('#addMenuBtn').addEventListener('click', function () { openMenuEditor(null); });
  $('#addIngredientBtn').addEventListener('click', function () { openIngredientEditor(null, false); });
  $('#printBtn').addEventListener('click', function () { buildReport(); window.print(); });
  $('#themeBtn').addEventListener('click', function () {
    state.settings.theme = effectiveDark() ? 'light' : 'dark';
    save(); applyTheme();
    var ts = $('#setTheme'); if (ts) ts.value = state.settings.theme;
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onMq = function () { if (state.settings.theme === 'system') applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  $('#menuSearch').addEventListener('input', function (e) { ui.search = e.target.value; renderMenus(); });
  $('#menuSort').addEventListener('change', function (e) { ui.sort = e.target.value; renderMenus(); });
  $('#ingredientSearch').addEventListener('input', function (e) { ui.ingSearch = e.target.value; renderIngredients(); });

  $('#categoryChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]');
    if (!b) return;
    ui.category = b.dataset.cat; renderMenus();
  });

  $('#menuGroups').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.addCat) return openMenuEditor(null, b.dataset.addCat);
    var id = b.dataset.id, m = id ? findMenu(id) : null;
    if (b.dataset.apply && m) {
      var c = calcMenu(m);
      var v = b.dataset.apply === 'price' ? c.suggested : c.suggestedDelivery;
      if (ok(v)) { m[b.dataset.apply] = v; save(); renderAll({ skipSettings: true }); toast('Price set to ' + money(v)); }
      return;
    }
    if (!m) return;
    if (b.dataset.act === 'edit') openMenuEditor(id);
    else if (b.dataset.act === 'dup') {
      var copy = clone(m); copy.id = uid('m'); copy.name = m.name + ' (copy)';
      state.menus.splice(state.menus.indexOf(m) + 1, 0, copy);
      save(); renderAll({ skipSettings: true }); toast('Duplicated “' + m.name + '”');
    } else if (b.dataset.act === 'del') {
      ask({ title: 'Delete menu?', html: '<p>“' + esc(m.name) + '” will be removed. Ingredients stay in your list.</p>', okText: 'Delete menu', danger: true })
        .then(function (yes) {
          if (!yes) return;
          state.menus = state.menus.filter(function (x) { return x.id !== id; });
          save(); renderAll({ skipSettings: true }); toast('Menu deleted');
        });
    }
  });
  $('#menuGroups').addEventListener('change', function (e) {
    var t = e.target;
    if (!t.classList.contains('inline-price')) return;
    var m = findMenu(t.dataset.id);
    if (!m) return;
    var v = num(t.value);
    if (v !== null && v < 0) { toast('Prices can’t be negative.', 'error'); t.value = numStr(m[t.dataset.field]); return; }
    m[t.dataset.field] = v !== null && v > 0 ? v : null;
    save(); renderAll({ skipSettings: true });
  });

  $('#ingredientTable').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-ing-act]');
    if (!b) return;
    var ing = findIng(b.dataset.id);
    if (!ing) return;
    if (b.dataset.ingAct === 'edit') return openIngredientEditor(ing.id, false);
    var used = usageCount(ing.id);
    var html = used.length
      ? '<p>“' + esc(ing.name) + '” is used in ' + used.length + (used.length === 1 ? ' menu' : ' menus') + ':</p><ul class="used-list">' + used.map(function (m) { return '<li>' + esc(m.name) + '</li>'; }).join('') + '</ul><p>Deleting it removes it from these recipes and lowers their HPP.</p>'
      : '<p>“' + esc(ing.name) + '” isn’t used in any menu.</p>';
    ask({ title: 'Delete ingredient?', html: html, okText: 'Delete ingredient', danger: true }).then(function (yes) {
      if (!yes) return;
      state.ingredients = state.ingredients.filter(function (i) { return i.id !== ing.id; });
      state.menus.forEach(function (m) { m.recipe = m.recipe.filter(function (l) { return l.ingredientId !== ing.id; }); });
      save(); renderAll({ skipSettings: true }); toast('Ingredient deleted');
    });
  });

  /* settings events */
  var settingsEl = $('#settingsPanel');
  settingsEl.addEventListener('change', function (e) {
    var t = e.target, s = state.settings, full = false;
    if (t.id === 'setName') s.businessName = t.value.trim() || 'My Business';
    else if (t.id === 'setTheme') s.theme = t.value;
    else if (t.id === 'setCurrency') {
      s.currency = t.value;
      if (!s.roundingStepCustom) s.roundingStep = defaultStep(s.currency);
      if (digits() === 0) s.priceEnding = 'step';
      full = true;
    }
    else if (t.id === 'setTarget') { var v = num(t.value); s.targetMargin = ok(v) ? clamp(v, 0, 95) : s.targetMargin; t.value = numStr(s.targetMargin); }
    else if (t.id === 'setStep') { var st = num(t.value); if (ok(st) && st > 0) { s.roundingStep = st; s.roundingStepCustom = true; } else { s.roundingStep = defaultStep(s.currency); s.roundingStepCustom = false; } t.value = numStr(s.roundingStep); }
    else if (t.id === 'setEnding') s.priceEnding = t.value;
    else if (t.id === 'setCommission') { var cm = num(t.value); s.deliveryCommission = ok(cm) ? clamp(cm, 0, 90) : 0; t.value = numStr(s.deliveryCommission); }
    else if (t.id === 'setIncludeOh') s.includeOverhead = t.checked;
    else if (t.id === 'setPortions') { var p = num(t.value); s.portionsPerMonth = ok(p) && p >= 0 ? Math.round(p) : 0; t.value = numStr(s.portionsPerMonth); }
    else if (t.dataset.ohName) { var o = s.overhead.filter(function (x) { return x.id === t.dataset.ohName; })[0]; if (o) o.name = t.value.trim() || 'Cost'; }
    else if (t.dataset.ohAmount) { var o2 = s.overhead.filter(function (x) { return x.id === t.dataset.ohAmount; })[0]; var a = num(t.value); if (o2) { o2.amount = ok(a) && a >= 0 ? a : 0; t.value = numStr(o2.amount); } }
    else if (t.dataset.catName) {
      var c = findCat(t.dataset.catName), nm = t.value.trim();
      if (c) { if (nm) c.name = nm; else t.value = c.name; }
    }
    else return;
    save();
    renderAll({ skipSettings: !full });
  });
  settingsEl.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var s = state.settings;
    if (b.id === 'addOhBtn') {
      var id = uid('oh');
      s.overhead.push({ id: id, name: 'New cost', amount: 0 });
      save(); renderAll();
      var el = $('#oh-n-' + id); if (el) { el.focus(); el.select(); }
    } else if (b.dataset.ohDel) {
      s.overhead = s.overhead.filter(function (o) { return o.id !== b.dataset.ohDel; });
      save(); renderAll();
    } else if (b.id === 'addCatBtn') {
      var cid = uid('cat');
      state.categories.push({ id: cid, name: 'New category' });
      save(); renderAll();
      var ce = $('#cat-' + cid); if (ce) { ce.focus(); ce.select(); }
    } else if (b.dataset.catDel) deleteCategory(b.dataset.catDel);
    else if (b.id === 'exportJsonBtn') exportJson();
    else if (b.id === 'importJsonBtn') $('#importFile').click();
    else if (b.id === 'exportCsvBtn') exportCsv();
    else if (b.id === 'sampleBtn') {
      ask({ title: 'Load sample data?', html: '<p>This replaces all your menus, ingredients and settings with the sample data. Export a backup first if you want to keep them.</p>', okText: 'Load sample data', danger: true })
        .then(function (yes) { if (!yes) return; state = normalizeData(clone(SAMPLE_DATA)); fmtCache = {}; ui.category = 'all'; save(); renderAll(); toast('Sample data loaded'); });
    } else if (b.id === 'clearBtn') {
      ask({ title: 'Clear all data?', html: '<p>All menus and ingredients will be deleted. Your settings, overhead and categories are kept. This can’t be undone.</p>', okText: 'Clear all data', danger: true })
        .then(function (yes) { if (!yes) return; state.menus = []; state.ingredients = []; save(); renderAll(); toast('All menus and ingredients cleared'); });
    }
  });

  function deleteCategory(id) {
    if (state.categories.length <= 1) return toast('Keep at least one category.', 'error');
    var cat = findCat(id);
    var menus = state.menus.filter(function (m) { return m.categoryId === id; });
    var others = state.categories.filter(function (c) { return c.id !== id; });
    var html = menus.length
      ? '<p>“' + esc(cat.name) + '” has ' + menus.length + (menus.length === 1 ? ' menu' : ' menus') + '. Move them to:</p><div class="field"><label for="moveTo" class="sr-only">Move menus to</label><select id="moveTo">' + others.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('') + '</select></div>'
      : '<p>“' + esc(cat.name) + '” has no menus.</p>';
    ask({ title: 'Delete category?', html: html, okText: 'Delete category', danger: true, collect: function (body) { var s = body.querySelector('#moveTo'); return s ? s.value : true; } })
      .then(function (target) {
        if (!target) return;
        if (typeof target === 'string') menus.forEach(function (m) { m.categoryId = target; });
        state.categories = others;
        if (ui.category === id) ui.category = 'all';
        save(); renderAll(); toast('Category deleted');
      });
  }

  /* keyboard: Escape closes the top-most dialog */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('#askModal').hidden) { if (askResolve) askResolve(false); return; }
    if (!$('#ingredientModal').hidden) { closeOverlay('ingredientModal'); ingDraft = null; return; }
    if (!$('#menuModal').hidden) { closeOverlay('menuModal'); menuDraft = null; }
  });
  $all('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () {
      var o = b.closest('.overlay');
      closeOverlay(o.id);
      if (o.id === 'menuModal') menuDraft = null;
      if (o.id === 'ingredientModal') ingDraft = null;
    });
  });
  $all('.overlay').forEach(function (o) {
    o.addEventListener('mousedown', function (e) {
      if (e.target !== o) return;
      if (o.id === 'askModal') { if (askResolve) askResolve(false); return; }
      closeOverlay(o.id);
      if (o.id === 'menuModal') menuDraft = null;
      if (o.id === 'ingredientModal') ingDraft = null;
    });
  });

  /* =========================================================
     IMPORT / EXPORT
     ========================================================= */
  function validateData(d) {
    if (!d || typeof d !== 'object') return 'The file is not a valid backup.';
    if (!d.settings || typeof d.settings !== 'object') return 'Settings are missing from the backup.';
    if (!Array.isArray(d.categories) || !Array.isArray(d.ingredients) || !Array.isArray(d.menus)) return 'Categories, ingredients or menus are missing from the backup.';
    var i;
    for (i = 0; i < d.categories.length; i++) if (!d.categories[i] || !d.categories[i].id || typeof d.categories[i].name !== 'string') return 'Category ' + (i + 1) + ' is invalid.';
    for (i = 0; i < d.ingredients.length; i++) {
      var g = d.ingredients[i];
      if (!g || !g.id || typeof g.name !== 'string' || !UNITS[g.unit] || !ok(num(g.qty)) || !ok(num(g.price))) return 'Ingredient ' + (i + 1) + ' is invalid.';
    }
    for (i = 0; i < d.menus.length; i++) {
      var m = d.menus[i];
      if (!m || !m.id || typeof m.name !== 'string' || !Array.isArray(m.recipe)) return 'Menu ' + (i + 1) + ' is invalid.';
    }
    if (CURRENCIES.every(function (c) { return c.code !== d.settings.currency; })) return 'The backup uses an unsupported currency.';
    return null;
  }
  function normalizeData(d) {
    var s = d.settings || {};
    var out = {
      version: DATA_VERSION,
      settings: {
        businessName: typeof s.businessName === 'string' && s.businessName.trim() ? s.businessName : 'My Business',
        currency: s.currency || 'USD',
        targetMargin: ok(num(s.targetMargin)) ? clamp(num(s.targetMargin), 0, 95) : 65,
        roundingStep: ok(num(s.roundingStep)) && num(s.roundingStep) > 0 ? num(s.roundingStep) : defaultStep(s.currency || 'USD'),
        roundingStepCustom: !!s.roundingStepCustom,
        priceEnding: ['step', '99', '49'].indexOf(s.priceEnding) > -1 ? s.priceEnding : 'step',
        deliveryCommission: ok(num(s.deliveryCommission)) ? clamp(num(s.deliveryCommission), 0, 90) : 0,
        includeOverhead: s.includeOverhead !== false,
        overhead: Array.isArray(s.overhead) ? s.overhead.map(function (o) { return { id: o.id || uid('oh'), name: String(o.name || 'Cost'), amount: Math.max(0, num(o.amount) || 0) }; }) : [],
        portionsPerMonth: ok(num(s.portionsPerMonth)) ? Math.max(0, Math.round(num(s.portionsPerMonth))) : 0,
        theme: ['system', 'light', 'dark'].indexOf(s.theme) > -1 ? s.theme : 'system'
      },
      categories: d.categories.map(function (c) { return { id: String(c.id), name: String(c.name) }; }),
      ingredients: d.ingredients.map(function (g) {
        return { id: String(g.id), name: String(g.name), qty: num(g.qty), unit: g.unit, price: Math.max(0, num(g.price)), waste: clamp(num(g.waste) || 0, 0, 90), note: String(g.note || '') };
      }),
      menus: d.menus.map(function (m) {
        return {
          id: String(m.id), name: String(m.name), categoryId: String(m.categoryId || ''),
          portions: ok(num(m.portions)) && num(m.portions) >= 1 ? Math.round(num(m.portions)) : 1,
          price: ok(num(m.price)) && num(m.price) > 0 ? num(m.price) : null,
          deliveryPrice: ok(num(m.deliveryPrice)) && num(m.deliveryPrice) > 0 ? num(m.deliveryPrice) : null,
          recipe: m.recipe.filter(function (l) { return l && l.ingredientId; }).map(function (l) { return { ingredientId: String(l.ingredientId), qty: num(l.qty), unit: UNITS[l.unit] ? l.unit : 'g' }; })
        };
      })
    };
    if (!out.categories.length) out.categories.push({ id: uid('cat'), name: 'Menu' });
    out.menus.forEach(function (m) { if (!out.categories.some(function (c) { return c.id === m.categoryId; })) m.categoryId = out.categories[0].id; });
    return out;
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function fileSlug() { return (state.settings.businessName || 'menu').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'menu'; }
  function today() { return new Date().toISOString().slice(0, 10); }

  function exportJson() {
    download(fileSlug() + '-backup-' + today() + '.json', JSON.stringify(state, null, 2), 'application/json');
    toast('Backup exported');
  }
  $('#importFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (err) { return toast('Import failed: the file is not valid JSON.', 'error'); }
      var problem = validateData(data);
      if (problem) return toast('Import failed: ' + problem, 'error');
      ask({ title: 'Import backup?', html: '<p>This replaces your current data with “' + esc(f.name) + '” (' + data.menus.length + ' menus, ' + data.ingredients.length + ' ingredients).</p>', okText: 'Import backup' })
        .then(function (yes) {
          if (!yes) return;
          state = normalizeData(data); fmtCache = {}; ui.category = 'all';
          save(); renderAll(); toast('Backup imported');
        });
    };
    reader.onerror = function () { toast('Import failed: the file could not be read.', 'error'); };
    reader.readAsText(f);
  });

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function round(n, d) { return ok(n) ? (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) : ''; }
  function exportCsv() {
    var d = digits() + 0;
    var rows = [['Category', 'Menu', 'Portions per recipe', 'HPP (' + state.settings.currency + ')', 'Dine-in price', 'Profit', 'Margin %', 'Food cost %', 'Delivery price', 'Delivery margin %']];
    state.categories.forEach(function (c) {
      state.menus.filter(function (m) { return m.categoryId === c.id; }).forEach(function (m) {
        var r = calcMenu(m);
        rows.push([c.name, m.name, m.portions, round(r.hpp, d), round(r.price, d), round(r.profit, d), round(r.margin, 1), round(r.foodCost, 1), r.deliveryOn ? round(r.deliveryPrice, d) : '', r.deliveryOn ? round(r.deliveryMargin, 1) : '']);
      });
    });
    download(fileSlug() + '-menu-report-' + today() + '.csv', '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'), 'text/csv');
    toast('CSV exported');
  }

  /* =========================================================
     PRINT REPORT
     ========================================================= */
  function buildReport() {
    var calcs = state.menus.map(function (m) { return calcMenu(m); });
    var mg = calcs.filter(function (c) { return ok(c.margin); });
    var hp = calcs.filter(function (c) { return ok(c.hpp); });
    var deliveryOn = (state.settings.deliveryCommission || 0) > 0;
    var h = '<header class="r-head"><h1>' + esc(state.settings.businessName) + '</h1><p>Menu costing report · ' +
      new Date().toLocaleDateString(currencyInfo().locale, { year: 'numeric', month: 'long', day: 'numeric' }) + '</p></header>' +
      '<div class="r-summary"><div><span>Menus</span><b>' + state.menus.length + '</b></div>' +
      '<div><span>Average HPP</span><b>' + money(hp.length ? hp.reduce(function (s, c) { return s + c.hpp; }, 0) / hp.length : null) + '</b></div>' +
      '<div><span>Average margin</span><b>' + pct(mg.length ? mg.reduce(function (s, c) { return s + c.margin; }, 0) / mg.length : null) + '</b></div>' +
      '<div><span>Target margin</span><b>' + state.settings.targetMargin + '%</b></div>' +
      '<div><span>Overhead per portion</span><b>' + money(overheadPerPortion()) + '</b></div></div>' +
      '<table class="r-table"><thead><tr><th>Menu</th><th>HPP</th><th>Dine-in price</th><th>Profit</th><th>Margin</th><th>Food cost</th>' + (deliveryOn ? '<th>Delivery price</th>' : '') + '</tr></thead>';
    state.categories.forEach(function (c) {
      var list = state.menus.filter(function (m) { return m.categoryId === c.id; });
      if (!list.length) return;
      h += '<tbody><tr class="r-cat"><th colspan="' + (deliveryOn ? 7 : 6) + '">' + esc(c.name) + '</th></tr>';
      list.forEach(function (m) {
        var r = calcMenu(m);
        h += '<tr><td>' + esc(m.name) + (m.portions > 1 ? ' <small>(batch of ' + m.portions + ')</small>' : '') + '</td><td>' + money(r.hpp) + '</td><td>' + money(r.price) + '</td><td>' + money(r.profit) + '</td><td class="r-' + r.status + '">' + pct(r.margin) + '</td><td>' + pct(r.foodCost) + '</td>' +
          (deliveryOn ? '<td>' + money(r.deliveryPrice) + '</td>' : '') + '</tr>';
      });
      h += '</tbody>';
    });
    h += '</table>';
    $('#printReport').innerHTML = h;
  }
  window.addEventListener('beforeprint', buildReport);

  /* =========================================================
     INIT
     ========================================================= */
  load();
  renderAll();
  switchTab('menus');
})();

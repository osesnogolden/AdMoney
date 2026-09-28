(function () {
  "use strict";

  const DEFAULT_INCOME = ["Beca", "Apoyo familiar", "Trabajo", "Ventas", "Reembolso", "Otro"];
  const DEFAULT_EXPENSE = ["Transporte", "Alimentación", "Materiales", "Plataformas", "Renta", "Entretenimiento", "Salud", "Servicios", "Otro"];

  function key(userId) { return `admoney_data_${userId}`; }

  function emptyData() {
    return {
      version: 2,
      movements: [],
      categories: { ingreso: [...DEFAULT_INCOME], gasto: [...DEFAULT_EXPENSE] },
      updatedAt: new Date().toISOString()
    };
  }

  function normalize(data) {
    const base = emptyData();
    if (!data || typeof data !== "object") return base;
    return {
      version: 2,
      movements: Array.isArray(data.movements) ? data.movements : [],
      categories: {
        ingreso: Array.from(new Set([...(data.categories?.ingreso || []), ...DEFAULT_INCOME])),
        gasto: Array.from(new Set([...(data.categories?.gasto || []), ...DEFAULT_EXPENSE]))
      },
      updatedAt: data.updatedAt || new Date().toISOString()
    };
  }

  function load(userId) {
    try { return normalize(JSON.parse(localStorage.getItem(key(userId)))); }
    catch (_) { return emptyData(); }
  }

  function save(userId, data) {
    data.updatedAt = new Date().toISOString();
    localStorage.setItem(key(userId), JSON.stringify(normalize(data)));
  }

  function exportData(userId, user) {
    const payload = { app: "AdMoney", exportedAt: new Date().toISOString(), user: { nombre: user.nombre, correo: user.correo }, data: load(userId) };
    return JSON.stringify(payload, null, 2);
  }

  function importData(userId, text) {
    const parsed = JSON.parse(text);
    const incoming = parsed?.data || parsed;
    const normalized = normalize(incoming);
    save(userId, normalized);
    return normalized;
  }

  window.AdMoneyStorage = { load, save, exportData, importData };
})();

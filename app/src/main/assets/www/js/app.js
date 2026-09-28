(function () {
  "use strict";

  const user = AdMoneyAuth.requireSession();
  if (!user) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
  const dateFmt = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  let data = AdMoneyStorage.load(user.id);
  let editId = null;
  let activeType = "gasto";
  let installPrompt = null;

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function parseDate(value) {
    const [y,m,d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  function saveAndRender(message) {
    AdMoneyStorage.save(user.id, data);
    renderAll();
    if (message) toast(message);
  }

  function setType(type) {
    activeType = type;
    $$(".segmented button").forEach(btn => btn.classList.toggle("active", btn.dataset.type === type));
    $("#movementType").value = type;
    fillCategorySelect(type);
  }

  function fillCategorySelect(type, selected) {
    const select = $("#category");
    const items = data.categories[type] || [];
    select.innerHTML = items.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if (selected && items.includes(selected)) select.value = selected;
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  }

  function monthKey(dateString) { return dateString.slice(0, 7); }

  function currentMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  }

  function totals(list = data.movements) {
    return list.reduce((acc, m) => {
      const amount = Number(m.amount) || 0;
      if (m.type === "ingreso") acc.income += amount;
      else acc.expense += amount;
      acc.count += 1;
      return acc;
    }, { income: 0, expense: 0, count: 0 });
  }

  function renderSummary() {
    const all = totals();
    const month = currentMonthKey();
    const monthTotals = totals(data.movements.filter(m => monthKey(m.date) === month));
    $("#totalIncome").textContent = money.format(all.income);
    $("#totalExpense").textContent = money.format(all.expense);
    $("#balance").textContent = money.format(all.income - all.expense);
    $("#movementCount").textContent = all.count;
    $("#monthIncomeMeta").textContent = `${money.format(monthTotals.income)} este mes`;
    $("#monthExpenseMeta").textContent = `${money.format(monthTotals.expense)} este mes`;
    $("#monthBalanceMeta").textContent = `${money.format(monthTotals.income - monthTotals.expense)} este mes`;
    $("#movementMeta").textContent = `${monthTotals.count} este mes`;
  }

  function filteredMovements() {
    const search = $("#filterSearch").value.trim().toLowerCase();
    const type = $("#filterType").value;
    const month = $("#filterMonth").value;
    return [...data.movements]
      .filter(m => !type || m.type === type)
      .filter(m => !month || monthKey(m.date) === month)
      .filter(m => !search || [m.category, m.note, m.amount, m.date].some(v => String(v ?? "").toLowerCase().includes(search)))
      .sort((a,b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));
  }

  function renderHistory() {
    const body = $("#movementRows");
    const list = filteredMovements();
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="6" class="empty-state">No hay movimientos con estos filtros.</td></tr>`;
      return;
    }
    body.innerHTML = list.map(m => `
      <tr>
        <td>${dateFmt.format(parseDate(m.date))}</td>
        <td><span class="type-badge ${m.type}">${m.type === "ingreso" ? "Ingreso" : "Gasto"}</span></td>
        <td>${escapeHtml(m.category)}</td>
        <td>${escapeHtml(m.note || "-")}</td>
        <td class="amount ${m.type === "ingreso" ? "income" : "expense"}">${m.type === "ingreso" ? "+" : "-"}${money.format(m.amount)}</td>
        <td><div class="table-actions">
          <button class="icon-btn edit" data-action="edit" data-id="${m.id}" aria-label="Editar">Editar</button>
          <button class="icon-btn delete" data-action="delete" data-id="${m.id}" aria-label="Eliminar">Eliminar</button>
        </div></td>
      </tr>`).join("");
  }

  function monthLabels(count = 6) {
    const out = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, label: d.toLocaleDateString("es-MX", { month: "short" }) });
    }
    return out;
  }

  function drawChart() {
    const canvas = $("#cashflowChart");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(300, Math.round(rect.width * dpr));
    canvas.height = Math.max(200, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0,0,w,h);

    const months = monthLabels(6).map(x => {
      const t = totals(data.movements.filter(m => monthKey(m.date) === x.key));
      return { ...x, income: t.income, expense: t.expense };
    });
    const max = Math.max(1, ...months.flatMap(m => [m.income, m.expense]));
    const left = 42, right = 12, top = 18, bottom = 34;
    const plotW = w - left - right, plotH = h - top - bottom;

    ctx.strokeStyle = "#e2e8f0";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    for (let i=0; i<=4; i++) {
      const y = top + plotH * i / 4;
      ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(w-right,y); ctx.stroke();
      const value = max * (1 - i/4);
      ctx.fillText(value >= 1000 ? `${Math.round(value/1000)}k` : Math.round(value), left-6, y+4);
    }

    const slot = plotW / months.length;
    const barW = Math.min(22, slot * .25);
    months.forEach((m, i) => {
      const center = left + slot*i + slot/2;
      const ih = plotH * m.income / max;
      const eh = plotH * m.expense / max;
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(center - barW - 2, top + plotH - ih, barW, ih);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(center + 2, top + plotH - eh, barW, eh);
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "center";
      ctx.fillText(m.label.replace(".", ""), center, h - 10);
    });
  }

  function renderCategoriesBreakdown() {
    const month = currentMonthKey();
    const expenses = data.movements.filter(m => m.type === "gasto" && monthKey(m.date) === month);
    const sums = {};
    expenses.forEach(m => sums[m.category] = (sums[m.category] || 0) + Number(m.amount));
    const entries = Object.entries(sums).sort((a,b) => b[1]-a[1]);
    const total = entries.reduce((s, [,v]) => s+v, 0);
    const wrap = $("#categoryBreakdown");
    if (!entries.length) {
      wrap.innerHTML = `<div class="empty-state">Agrega gastos para ver el desglose del mes.</div>`;
      return;
    }
    wrap.innerHTML = entries.slice(0,6).map(([name, value]) => `
      <div class="category-row"><div>
        <div class="category-label"><span>${escapeHtml(name)}</span><strong>${money.format(value)}</strong></div>
        <div class="category-bar"><span style="width:${Math.max(3, value/total*100).toFixed(1)}%"></span></div>
      </div><small>${(value/total*100).toFixed(0)}%</small></div>
    `).join("");
  }

  function renderMonthSummary() {
    const key = $("#summaryMonth").value || currentMonthKey();
    const t = totals(data.movements.filter(m => monthKey(m.date) === key));
    $("#monthIncome").textContent = money.format(t.income);
    $("#monthExpense").textContent = money.format(t.expense);
    $("#monthBalance").textContent = money.format(t.income - t.expense);
  }

  function renderAll() {
    renderSummary();
    renderHistory();
    renderCategoriesBreakdown();
    renderMonthSummary();
    drawChart();
  }

  function resetForm() {
    editId = null;
    $("#movementForm").reset();
    $("#movementDate").value = todayISO();
    $("#submitMovement").textContent = "Guardar movimiento";
    $("#cancelEdit").classList.add("hidden");
    setType("gasto");
  }

  function editMovement(id) {
    const m = data.movements.find(x => String(x.id) === String(id));
    if (!m) return;
    editId = m.id;
    setType(m.type);
    $("#movementDate").value = m.date;
    $("#amount").value = m.amount;
    fillCategorySelect(m.type, m.category);
    $("#note").value = m.note || "";
    $("#submitMovement").textContent = "Guardar cambios";
    $("#cancelEdit").classList.remove("hidden");
    $("#movementForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function deleteMovement(id) {
    const m = data.movements.find(x => String(x.id) === String(id));
    if (!m) return;
    if (!confirm(`¿Eliminar el ${m.type} de ${money.format(m.amount)}?`)) return;
    data.movements = data.movements.filter(x => String(x.id) !== String(id));
    saveAndRender("Movimiento eliminado.");
    if (String(editId) === String(id)) resetForm();
  }

  function renderCategoryManager() {
    const type = $("#managerType").value;
    const list = $("#categoryTags");
    list.innerHTML = data.categories[type].map(name => {
      const used = data.movements.some(m => m.type === type && m.category === name);
      return `<span class="tag">${escapeHtml(name)} ${used ? "" : `<button data-category-delete="${escapeHtml(name)}" title="Eliminar">×</button>`}</span>`;
    }).join("");
  }

  function openCategories() {
    $("#categoryModal").classList.remove("hidden");
    renderCategoryManager();
  }
  function closeCategories() { $("#categoryModal").classList.add("hidden"); }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportJson() {
    download(`admoney-respaldo-${todayISO()}.json`, AdMoneyStorage.exportData(user.id, user), "application/json");
    toast("Respaldo JSON descargado.");
  }

  function exportCsv() {
    const rows = [["fecha","tipo","categoria","descripcion","cantidad"]];
    [...data.movements].sort((a,b) => a.date.localeCompare(b.date)).forEach(m => rows.push([m.date,m.type,m.category,m.note||"",Number(m.amount).toFixed(2)]));
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    download(`admoney-movimientos-${todayISO()}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
    toast("CSV descargado.");
  }

  function init() {
    $("#userName").textContent = user.nombre;
    $("#userInitial").textContent = user.nombre.trim().charAt(0).toUpperCase();
    $("#welcomeName").textContent = user.nombre.split(" ")[0];
    $("#movementDate").value = todayISO();
    $("#filterMonth").value = currentMonthKey();
    $("#summaryMonth").value = currentMonthKey();
    setType("gasto");
    renderAll();

    $$(".segmented button").forEach(btn => btn.addEventListener("click", () => setType(btn.dataset.type)));

    $("#movementForm").addEventListener("submit", e => {
      e.preventDefault();
      const amount = Number($("#amount").value);
      const date = $("#movementDate").value;
      const category = $("#category").value;
      const note = $("#note").value.trim();
      if (!Number.isFinite(amount) || amount <= 0 || !date || !category) return toast("Completa una cantidad válida, fecha y categoría.");
      if (editId) {
        const m = data.movements.find(x => String(x.id) === String(editId));
        Object.assign(m, { type: activeType, amount: Number(amount.toFixed(2)), date, category, note, updatedAt: new Date().toISOString() });
        saveAndRender("Movimiento actualizado.");
      } else {
        data.movements.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2,8)}`, type: activeType, amount: Number(amount.toFixed(2)), date, category, note, createdAt: new Date().toISOString() });
        saveAndRender("Movimiento guardado.");
      }
      resetForm();
    });

    $("#cancelEdit").addEventListener("click", resetForm);
    ["#filterSearch", "#filterType", "#filterMonth"].forEach(id => $(id).addEventListener(id === "#filterSearch" ? "input" : "change", renderHistory));
    $("#clearFilters").addEventListener("click", () => { $("#filterSearch").value=""; $("#filterType").value=""; $("#filterMonth").value=""; renderHistory(); });
    $("#summaryMonth").addEventListener("change", renderMonthSummary);

    $("#movementRows").addEventListener("click", e => {
      const btn = e.target.closest("button[data-action]"); if (!btn) return;
      if (btn.dataset.action === "edit") editMovement(btn.dataset.id);
      if (btn.dataset.action === "delete") deleteMovement(btn.dataset.id);
    });

    $("#logoutBtn").addEventListener("click", () => { AdMoneyAuth.logout(); window.location.replace("login.html"); });
    $("#categoriesBtn").addEventListener("click", openCategories);
    $("#closeCategoryModal").addEventListener("click", closeCategories);
    $("#categoryModal").addEventListener("click", e => { if (e.target === e.currentTarget) closeCategories(); });
    $("#managerType").addEventListener("change", renderCategoryManager);
    $("#addCategory").addEventListener("click", () => {
      const type = $("#managerType").value;
      const input = $("#newCategory");
      const name = input.value.trim();
      if (!name) return;
      if (data.categories[type].some(c => c.toLowerCase() === name.toLowerCase())) return toast("La categoría ya existe.");
      data.categories[type].push(name); input.value = ""; saveAndRender("Categoría agregada."); renderCategoryManager(); fillCategorySelect(activeType);
    });
    $("#newCategory").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#addCategory").click(); } });
    $("#categoryTags").addEventListener("click", e => {
      const btn = e.target.closest("button[data-category-delete]"); if (!btn) return;
      const type = $("#managerType").value;
      data.categories[type] = data.categories[type].filter(c => c !== btn.dataset.categoryDelete);
      saveAndRender("Categoría eliminada."); renderCategoryManager(); fillCategorySelect(activeType);
    });

    window.addEventListener("resize", () => { clearTimeout(drawChart.timer); drawChart.timer = setTimeout(drawChart, 120); });
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; $("#installBtn").classList.remove("hidden"); });
    $("#installBtn").addEventListener("click", async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("#installBtn").classList.add("hidden"); });

    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

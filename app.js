const STORAGE_KEY = "library-acq-processing-v1";

const LOOKUPS = {
  statuses: [
    "Ordered",
    "Being considered",
    "Approved",
    "Rejected",
    "Arrived",
    "Arrived damaged",
    "In cataloging",
    "In processing",
    "Ready for shelf",
    "Completed / Shelved"
  ],
  sources: ["Ordered", "Memorial", "Adopted Author", "Donation", "Bulk Donation Intake"],
  formats: ["Hardcover", "Paperback", "Audiobook", "eBook", "Large Print", "Other"]
};

const TABS = [
  "Dashboard",
  "Orders",
  "Bulk Donations",
  "Items In Process",
  "Reports",
  "Print Slips",
  "Settings"
];

/**
 * Data model is normalized so reports and tables can join related entities safely.
 */
const state = loadState();
let activeTab = "Dashboard";

const tabsEl = document.getElementById("tabs");
const appEl = document.getElementById("app");

renderTabs();
render();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const now = new Date().toISOString();
  const defaults = {
    items: [],
    orders: [],
    batches: [],
    history: [],
    lookupOverrides: { statuses: [], sources: [] },
    createdAt: now
  };
  if (!raw) return defaults;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }

  return {
    ...defaults,
    ...parsed,
    items: Array.isArray(parsed?.items) ? parsed.items : [],
    orders: Array.isArray(parsed?.orders) ? parsed.orders : [],
    batches: Array.isArray(parsed?.batches) ? parsed.batches : [],
    history: Array.isArray(parsed?.history) ? parsed.history : [],
    lookupOverrides: {
      statuses: Array.isArray(parsed?.lookupOverrides?.statuses) ? parsed.lookupOverrides.statuses : [],
      sources: Array.isArray(parsed?.lookupOverrides?.sources) ? parsed.lookupOverrides.sources : []
    }
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function isoDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function allStatuses() {
  return [...new Set([...LOOKUPS.statuses, ...state.lookupOverrides.statuses])];
}

function allSources() {
  return [...new Set([...LOOKUPS.sources, ...state.lookupOverrides.sources])];
}

function coverImageForIsbn(isbn = "") {
  const normalized = String(isbn).replace(/[^0-9Xx]/g, "").toUpperCase();
  if (!normalized) return "";
  return `https://covers.openlibrary.org/b/isbn/${normalized}-M.jpg`;
}

function ageDays(item) {
  const start = new Date(item.dateReceived || item.orderDate || item.createdAt || Date.now());
  return Math.floor((Date.now() - start.getTime()) / 86400000);
}

function agingBadge(days, isComplete) {
  if (isComplete) return `<span class="badge ok">Complete</span>`;
  if (days >= 30) return `<span class="badge stalled">${days}d stalled</span>`;
  if (days >= 14) return `<span class="badge watch">${days}d watch</span>`;
  return `<span class="badge ok">${days}d</span>`;
}

function renderTabs() {
  tabsEl.innerHTML = "";
  TABS.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className = `tab-btn ${activeTab === tab ? "active" : ""}`;
    btn.textContent = tab;
    btn.onclick = () => {
      activeTab = tab;
      renderTabs();
      render();
    };
    tabsEl.appendChild(btn);
  });
}

function render() {
  switch (activeTab) {
    case "Dashboard":
      return renderDashboard();
    case "Orders":
      return renderOrders();
    case "Bulk Donations":
      return renderBulkDonations();
    case "Items In Process":
      return renderItemsInProcess();
    case "Reports":
      return renderReports();
    case "Print Slips":
      return renderPrintSlips();
    case "Settings":
      return renderSettings();
    default:
      appEl.textContent = "Unknown tab";
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDashboard() {
  const items = state.items;
  const incomplete = items.filter((i) => i.status !== "Completed / Shelved");
  const stalled = incomplete.filter((i) => ageDays(i) >= 30);
  appEl.innerHTML = `
    <section class="section">
      <h2>Workflow Snapshot</h2>
      <div class="kpi">
        <div>Total Items<strong>${items.length}</strong></div>
        <div>In Process<strong>${incomplete.length}</strong></div>
        <div>Damaged<strong>${items.filter((i) => i.status === "Arrived damaged").length}</strong></div>
        <div>Stalled 30+ days<strong>${stalled.length}</strong></div>
      </div>
    </section>
    <section class="section">
      <h3>Recent Incomplete Items</h3>
      ${itemsTable(
        incomplete
          .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
          .slice(0, 15)
      )}
    </section>
  `;
  wireRowActions();
}

function renderOrders() {
  const statuses = allStatuses();
  const sources = allSources();
  const activeOrders = state.orders.filter((order) => !order.archivedAt);
  const archivedOrders = state.orders.filter((order) => order.archivedAt);

  const orderRows = (orders) =>
    orders
      .map((order) => {
        const orderItems = state.items.filter((item) => item.orderId === order.id);
        const completed = orderItems.filter((item) => item.status === "Completed / Shelved").length;
        const canArchive = orderItems.length > 0 && completed === orderItems.length;
        const orderStatus = canArchive ? "Ready to archive" : `${completed}/${orderItems.length} complete`;
        return `<tr>
          <td>${escapeHtml(order.orderNumber || "—")}</td>
          <td>${escapeHtml(order.vendor || "—")}</td>
          <td>${escapeHtml(order.orderDate || "—")}</td>
          <td>${orderItems.length}</td>
          <td>${escapeHtml(orderStatus)}</td>
          <td>${escapeHtml(order.source || "—")}</td>
          <td>
            ${
              order.archivedAt
                ? `<span class="badge ok">Archived</span>`
                : `<button class="primary" data-archive-order="${order.id}" ${canArchive ? "" : "disabled"}>Archive</button>`
            }
          </td>
        </tr>`;
      })
      .join("");

  appEl.innerHTML = `
    <section class="section">
      <div class="inline" style="justify-content: space-between;">
        <h2>Orders Overview</h2>
        <button id="open-order-modal" class="primary" type="button">Add Order</button>
      </div>
      <p class="subhead">Create one order and add multiple items that share the same order details.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Order #</th><th>Vendor</th><th>Order Date</th><th>Items</th><th>Progress</th><th>Source</th><th>Actions</th></tr>
          </thead>
          <tbody>${orderRows(activeOrders) || `<tr><td colspan="7">No active orders yet.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
    <section class="section">
      <h3>Archived Orders</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Order #</th><th>Vendor</th><th>Order Date</th><th>Items</th><th>Progress</th><th>Source</th><th>Actions</th></tr>
          </thead>
          <tbody>${orderRows(archivedOrders) || `<tr><td colspan="7">No archived orders.</td></tr>`}</tbody>
        </table>
      </div>
    </section>

    <div id="order-modal" class="modal-backdrop" hidden>
      <section class="modal">
        <div class="inline" style="justify-content: space-between;">
          <h3>Create Order</h3>
          <button id="close-order-modal" type="button">Close</button>
        </div>
        <form id="order-form" class="grid">
          <label>Order Number<input required name="orderNumber" /></label>
          <label>Order Date<input required name="orderDate" type="date" value="${isoDate()}" /></label>
          <label>Vendor<input required name="vendor" /></label>
          <label>Order Price (per item)<input name="orderPrice" type="number" step="0.01" /></label>
          <label>Status
            <select name="status">${statuses.map((s) => `<option ${s === "Ordered" ? "selected" : ""}>${s}</option>`)}</select>
          </label>
          <label>Acquisition Source
            <select name="source">${sources.map((s) => `<option>${s}</option>`)}</select>
          </label>
          <label>Donation Source / Donor<input name="donor" /></label>
          <label>Date Received<input name="dateReceived" type="date" /></label>
          <label style="grid-column: span 4;">Order Notes<textarea name="notes"></textarea></label>

          <div style="grid-column: span 4;">
            <div class="inline" style="justify-content: space-between;">
              <h4>Items in this order</h4>
              <button id="add-order-item" type="button">Add Item Row</button>
            </div>
            <div id="order-items-list" class="order-items-list"></div>
          </div>

          <div class="inline" style="grid-column: span 4; justify-content: flex-end;">
            <button type="button" id="cancel-order-create">Cancel</button>
            <button type="submit" class="primary">Save Order</button>
          </div>
        </form>
      </section>
    </div>
  `;

  const modal = document.getElementById("order-modal");
  const openModal = () => {
    modal.removeAttribute("hidden");
    modal.classList.add("is-open");
  };
  const closeModal = () => {
    modal.setAttribute("hidden", "");
    modal.classList.remove("is-open");
  };

  const addItemRow = () => {
    const statuses = allStatuses();
    const row = document.createElement("div");
    row.className = "order-item-row";
    row.innerHTML = `
      <label>Title<input required name="itemTitle" /></label>
      <label>Author<input required name="itemAuthor" /></label>
      <label>ISBN<input name="itemIsbn" /></label>
      <label>Format
        <select name="itemFormat">${LOOKUPS.formats.map((f) => `<option>${f}</option>`).join("")}</select>
      </label>
      <label>Status
        <select name="itemStatus">${statuses.map((s) => `<option ${s === "Ordered" ? "selected" : ""}>${s}</option>`).join("")}</select>
      </label>
      <label>Purchase Price<input name="itemPurchasePrice" type="number" step="0.01" /></label>
      <label>Retail Price<input name="itemRetailPrice" type="number" step="0.01" /></label>
      <button type="button" class="danger remove-order-item">Remove</button>
    `;
    document.getElementById("order-items-list").appendChild(row);
  };

  document.getElementById("open-order-modal").addEventListener("click", () => {
    openModal();
    if (!document.querySelector("#order-items-list .order-item-row")) addItemRow();
  });
  document.getElementById("close-order-modal").addEventListener("click", closeModal);
  document.getElementById("cancel-order-create").addEventListener("click", closeModal);
  document.getElementById("add-order-item").addEventListener("click", addItemRow);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (activeTab === "Orders" && e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
  });

  document.getElementById("order-items-list").addEventListener("click", (e) => {
    if (!e.target.classList.contains("remove-order-item")) return;
    const rows = document.querySelectorAll("#order-items-list .order-item-row");
    if (rows.length === 1) return;
    e.target.closest(".order-item-row")?.remove();
  });

  document.querySelectorAll("button[data-archive-order]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const order = state.orders.find((entry) => entry.id === btn.dataset.archiveOrder);
      if (!order) return;
      const orderItems = state.items.filter((item) => item.orderId === order.id);
      const allCompleted = orderItems.length > 0 && orderItems.every((item) => item.status === "Completed / Shelved");
      if (!allCompleted) {
        alert("All items in this order must be completed before archiving.");
        return;
      }
      order.archivedAt = new Date().toISOString();
      order.updatedAt = new Date().toISOString();
      saveState();
      renderOrders();
    });
  });

  document.getElementById("order-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const rowEls = [...document.querySelectorAll("#order-items-list .order-item-row")];
    const orderItems = rowEls.map((row) => ({
      title: row.querySelector('[name="itemTitle"]').value.trim(),
      author: row.querySelector('[name="itemAuthor"]').value.trim(),
      isbn: row.querySelector('[name="itemIsbn"]').value.trim(),
      format: row.querySelector('[name="itemFormat"]').value.trim(),
      status: row.querySelector('[name="itemStatus"]').value.trim(),
      purchasePrice: row.querySelector('[name="itemPurchasePrice"]').value.trim(),
      retailPrice: row.querySelector('[name="itemRetailPrice"]').value.trim()
    }));

    if (orderItems.some((entry) => !entry.title || !entry.author)) {
      alert("Each order item row requires a title and author.");
      return;
    }

    const fd = new FormData(form);
    const now = new Date().toISOString();
    const order = {
      id: id("order"),
      createdAt: now,
      updatedAt: now,
      archivedAt: "",
      itemIds: []
    };
    fd.forEach((v, k) => (order[k] = String(v).trim()));
    state.orders.push(order);

    orderItems.forEach((entry) => {
      const item = {
        id: id("item"),
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        vendor: order.vendor,
        orderPrice: order.orderPrice,
        status: entry.status || order.status,
        source: order.source,
        donor: order.donor,
        dateReceived: order.dateReceived,
        notes: order.notes,
        coverImage: coverImageForIsbn(entry.isbn),
        createdAt: now,
        updatedAt: now,
        ...entry
      };
      state.items.push(item);
      order.itemIds.push(item.id);
      state.history.push({
        id: id("hist"),
        itemId: item.id,
        timestamp: now,
        action: `Item created from order ${order.orderNumber || order.id} with status ${item.status}`
      });
    });

    saveState();
    form.reset();
    document.getElementById("order-items-list").innerHTML = "";
    closeModal();
    renderOrders();
  });
}

function renderBulkDonations() {
  const batchRows = state.batches
    .map((batch) => {
      const items = state.items.filter((i) => i.batchId === batch.id);
      const counts = {
        approved: items.filter((i) => i.status === "Approved").length,
        rejected: items.filter((i) => i.status === "Rejected").length,
        considered: items.filter((i) => i.status === "Being considered").length
      };
      return `<tr>
        <td>${batch.batchName}</td>
        <td>${batch.batchNumber || ""}</td>
        <td>${batch.donor || ""}</td>
        <td>${items.length}</td>
        <td>${counts.approved}</td>
        <td>${counts.rejected}</td>
        <td>${counts.considered}</td>
      </tr>`;
    })
    .join("");

  appEl.innerHTML = `
    <section class="section">
      <h2>Create Bulk Donation Batch</h2>
      <form id="batch-form" class="grid two">
        <label>Batch Name<input required name="batchName" /></label>
        <label>Batch Number<input name="batchNumber" /></label>
        <label>Donor / Source<input name="donor" /></label>
        <label>Date Received<input type="date" name="dateReceived" value="${isoDate()}"/></label>
        <label style="grid-column: span 2;">Batch Notes<textarea name="notes"></textarea></label>
        <div class="inline" style="grid-column: span 2; justify-content: flex-end;">
          <button class="primary" type="submit">Create Batch</button>
        </div>
      </form>
    </section>

    <section class="section">
      <h3>Quick Add Items to Batch</h3>
      <form id="quick-add" class="grid">
        <label>Batch
          <select required name="batchId">
            <option value="">Select batch</option>
            ${state.batches.map((b) => `<option value="${b.id}">${b.batchName}</option>`).join("")}
          </select>
        </label>
        <label>Title<input required name="title" /></label>
        <label>Author<input required name="author" /></label>
        <label>ISBN<input name="isbn" /></label>
        <label>Format
          <select name="format">${LOOKUPS.formats.map((f) => `<option>${f}</option>`).join("")}</select>
        </label>
        <label>Status
          <select name="status">
            ${allStatuses()
              .map((status) => `<option value="${escapeHtml(status)}" ${status === "Being considered" ? "selected" : ""}>${escapeHtml(status)}</option>`)
              .join("")}
          </select>
        </label>
        <label>Rejection Reason<input name="rejectionReason" /></label>
        <label>Notes<input name="notes" /></label>
        <div class="inline" style="grid-column: span 4; justify-content: flex-end;">
          <button class="primary" type="submit">Add to Batch</button>
        </div>
      </form>
    </section>

    <section class="section">
      <h3>Bulk Donation Batches</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Batch</th><th>#</th><th>Donor</th><th>Total</th><th>Approved</th><th>Rejected</th><th>Considering</th></tr>
          </thead>
          <tbody>${batchRows || `<tr><td colspan="7">No batches yet.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;

  document.getElementById("batch-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const batch = { id: id("batch"), createdAt: new Date().toISOString() };
    fd.forEach((v, k) => (batch[k] = String(v).trim()));
    state.batches.push(batch);
    saveState();
    renderBulkDonations();
  });

  document.getElementById("quick-add").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const item = {
      id: id("item"),
      source: "Bulk Donation Intake",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dateReceived: isoDate()
    };
    fd.forEach((v, k) => (item[k] = String(v).trim()));
    item.coverImage = coverImageForIsbn(item.isbn);
    state.items.push(item);
    state.history.push({
      id: id("hist"),
      itemId: item.id,
      timestamp: new Date().toISOString(),
      action: `Quick add in batch with status ${item.status}`
    });
    saveState();
    e.currentTarget.reset();
    renderBulkDonations();
  });
}

function renderItemsInProcess() {
  const incomplete = state.items.filter((i) => i.status !== "Completed / Shelved");
  appEl.innerHTML = `
    <section class="section">
      <h2>Items In Process</h2>
      <div class="toolbar">
        <input id="search" placeholder="Search title, author, ISBN, order #, donor, memorial, adopted author" />
        <select id="status-filter"><option value="">All Statuses</option>${allStatuses().map((s) => `<option>${s}</option>`)}</select>
        <select id="source-filter"><option value="">All Sources</option>${allSources().map((s) => `<option>${s}</option>`)}</select>
      </div>
      ${itemsTable(incomplete)}
    </section>
  `;

  const rerender = () => {
    const q = document.getElementById("search").value.toLowerCase();
    const status = document.getElementById("status-filter").value;
    const source = document.getElementById("source-filter").value;
    const filtered = incomplete.filter((i) => {
      const hay = [
        i.title,
        i.author,
        i.isbn,
        i.orderNumber,
        i.donor,
        i.memorialInfo,
        i.adoptedAuthorInfo
      ]
        .join(" ")
        .toLowerCase();
      return (!q || hay.includes(q)) && (!status || i.status === status) && (!source || i.source === source);
    });
    document.querySelector(".table-wrap").outerHTML = itemsTable(filtered);
    wireRowActions();
  };

  ["search", "status-filter", "source-filter"].forEach((idStr) =>
    document.getElementById(idStr).addEventListener("input", rerender)
  );
  wireRowActions();
}

function itemsTable(items) {
  const statuses = allStatuses();
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Cover</th><th>Title</th><th>Author</th><th>Source</th><th>Status</th><th>Updated</th><th>Aging</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${
            items
              .map((item) => {
                const days = ageDays(item);
                return `<tr>
                  <td>${item.coverImage ? `<img class="thumb" src="${escapeHtml(item.coverImage)}" alt="Cover for ${escapeHtml(item.title || "item")}" loading="lazy" />` : "—"}</td>
                  <td>${item.title || ""}</td>
                  <td>${item.author || ""}</td>
                  <td>${item.source || ""}</td>
                  <td>
                    <select data-action="status-select" data-id="${item.id}">
                      ${statuses.map((status) => `<option value="${escapeHtml(status)}" ${item.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
                    </select>
                  </td>
                  <td>${(item.updatedAt || item.createdAt || "").slice(0, 10)}</td>
                  <td>${agingBadge(days, item.status === "Completed / Shelved")}</td>
                  <td>
                    <div class="status-actions">
                      <button data-action="view" data-id="${item.id}">Details</button>
                      <button data-action="damaged" data-id="${item.id}" class="warn">Damaged</button>
                      <button data-action="reject" data-id="${item.id}" class="danger">Reject</button>
                    </div>
                  </td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="8">No items found.</td></tr>`
          }
        </tbody>
      </table>
    </div>`;
}

function wireRowActions() {
  document.querySelectorAll('select[data-action="status-select"]').forEach((selectEl) => {
    selectEl.addEventListener("change", () => {
      const item = state.items.find((i) => i.id === selectEl.dataset.id);
      if (!item) return;
      updateStatus(item, selectEl.value, "Status selected from dropdown");
    });
  });

  document.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = state.items.find((i) => i.id === btn.dataset.id);
      if (!item) return;
      const action = btn.dataset.action;

      if (action === "view") {
        renderItemDetail(item.id);
        return;
      }

      if (action === "damaged") {
        const note = prompt("Damage notes", item.damageNotes || "");
        item.damageNotes = note || item.damageNotes || "";
        item.damagedAt = isoDate();
        updateStatus(item, "Arrived damaged", "Marked damaged");
      }

      if (action === "reject") {
        const reason = prompt("Rejection reason", item.rejectionReason || "");
        item.rejectionReason = reason || item.rejectionReason || "";
        updateStatus(item, "Rejected", "Marked rejected");
      }
    });
  });
}

function updateStatus(item, status, action) {
  item.status = status;
  item.updatedAt = new Date().toISOString();
  if (status === "Completed / Shelved" && !item.dateCompleted) item.dateCompleted = isoDate();
  state.history.push({ id: id("hist"), itemId: item.id, timestamp: item.updatedAt, action: `${action}: ${status}` });
  saveState();
  render();
}

function renderItemDetail(itemId) {
  const item = state.items.find((i) => i.id === itemId);
  const hist = state.history.filter((h) => h.itemId === itemId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  appEl.innerHTML = `
    <section class="section">
      <div class="inline" style="justify-content: space-between;">
        <h2>Item Detail: ${item.title}</h2>
        <button id="back">Back</button>
      </div>
      ${
        item.coverImage
          ? `<div class="detail-cover-wrap"><img class="detail-cover" src="${escapeHtml(item.coverImage)}" alt="Cover for ${escapeHtml(item.title || "item")}" /></div>`
          : ""
      }
      <form id="edit-form" class="grid">
        <label style="grid-column: span 4;">
          Cover image URL
          <input name="coverImage" value="${(item.coverImage || "").replaceAll('"', "&quot;")}" readonly />
        </label>
        <label>title<input name="title" value="${(item.title || "").replaceAll('"', "&quot;")}"/></label>
        <label>author<input name="author" value="${(item.author || "").replaceAll('"', "&quot;")}"/></label>
        <label>isbn<input name="isbn" value="${(item.isbn || "").replaceAll('"', "&quot;")}"/></label>
        <label>format<input name="format" value="${(item.format || "").replaceAll('"', "&quot;")}"/></label>
        <label>orderNumber<input name="orderNumber" value="${(item.orderNumber || "").replaceAll('"', "&quot;")}"/></label>
        <label>orderDate<input name="orderDate" value="${(item.orderDate || "").replaceAll('"', "&quot;")}"/></label>
        <label>vendor<input name="vendor" value="${(item.vendor || "").replaceAll('"', "&quot;")}"/></label>
        <label>orderPrice<input name="orderPrice" value="${(item.orderPrice || "").replaceAll('"', "&quot;")}"/></label>
        <label>purchasePrice<input name="purchasePrice" value="${(item.purchasePrice || "").replaceAll('"', "&quot;")}"/></label>
        <label>retailPrice<input name="retailPrice" value="${(item.retailPrice || "").replaceAll('"', "&quot;")}"/></label>
        <label>donor<input name="donor" value="${(item.donor || "").replaceAll('"', "&quot;")}"/></label>
        <label>memorialInfo<input name="memorialInfo" value="${(item.memorialInfo || "").replaceAll('"', "&quot;")}"/></label>
        <label>adoptedAuthorInfo<input name="adoptedAuthorInfo" value="${(item.adoptedAuthorInfo || "").replaceAll('"', "&quot;")}"/></label>
        <label>Status
          <select name="status">${allStatuses().map((s) => `<option value="${escapeHtml(s)}" ${item.status === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select>
        </label>
        <label>Source
          <select name="source">${allSources().map((s) => `<option value="${escapeHtml(s)}" ${item.source === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select>
        </label>
        <label>dateReceived<input name="dateReceived" value="${(item.dateReceived || "").replaceAll('"', "&quot;")}"/></label>
        <label>dateCompleted<input name="dateCompleted" value="${(item.dateCompleted || "").replaceAll('"', "&quot;")}"/></label>
        <label>rejectionReason<input name="rejectionReason" value="${(item.rejectionReason || "").replaceAll('"', "&quot;")}"/></label>
        <label>damageNotes<input name="damageNotes" value="${(item.damageNotes || "").replaceAll('"', "&quot;")}"/></label>
        <label style="grid-column: span 2;">notes<textarea name="notes">${item.notes || ""}</textarea></label>
        <label>processingNotes<textarea name="processingNotes">${item.processingNotes || ""}</textarea></label>
        <label>slipNotes<textarea name="slipNotes">${item.slipNotes || ""}</textarea></label>
        <div class="inline" style="grid-column: span 4; justify-content: flex-end;">
          <button class="primary" type="submit">Save Changes</button>
        </div>
      </form>
    </section>
    <section class="section">
      <h3>Editable History</h3>
      <div class="table-wrap">
        <table><thead><tr><th>When</th><th>Action</th></tr></thead>
        <tbody>${hist.map((h) => `<tr><td>${h.timestamp}</td><td>${h.action}</td></tr>`).join("") || "<tr><td colspan='2'>No history.</td></tr>"}</tbody>
        </table>
      </div>
    </section>
  `;

  document.getElementById("back").onclick = () => {
    activeTab = "Items In Process";
    renderTabs();
    render();
  };

  document.getElementById("edit-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.forEach((v, k) => (item[k] = String(v).trim()));
    item.coverImage = coverImageForIsbn(item.isbn);
    item.updatedAt = new Date().toISOString();
    state.history.push({ id: id("hist"), itemId: item.id, timestamp: item.updatedAt, action: "Details edited" });
    saveState();
    alert("Updated.");
  });
}

function renderReports() {
  const damaged = state.items.filter((i) => i.status === "Arrived damaged");
  const incomplete = state.items.filter((i) => i.status !== "Completed / Shelved");
  const rejected = state.items.filter((i) => i.status === "Rejected");

  const batchOptions = state.batches.map((b) => `<option value="${b.id}">${b.batchName}</option>`).join("");
  const selectedBatch = state.batches[0]?.id || "";

  appEl.innerHTML = `
    <section class="section">
      <h2>Damaged Items Report</h2>
      ${reportTable(
        ["Title", "Author", "Vendor/Donor", "Order #", "Date Marked Damaged", "Notes"],
        damaged.map((i) => [i.title, i.author, i.vendor || i.donor || "", i.orderNumber || "", i.damagedAt || "", i.damageNotes || ""])
      )}
    </section>

    <section class="section">
      <h2>Incomplete Items Report</h2>
      ${reportTable(
        ["Title", "Author", "Current Status", "Source", "Aging"],
        incomplete.map((i) => [i.title, i.author, i.status, i.source || "", `${ageDays(i)} days`])
      )}
    </section>

    <section class="section">
      <h2>Rejected Items Report</h2>
      ${reportTable(
        ["Title", "Author", "Batch/Donor", "Reason"],
        rejected.map((i) => {
          const batch = state.batches.find((b) => b.id === i.batchId);
          return [i.title, i.author, batch?.batchName || i.donor || "", i.rejectionReason || ""];
        })
      )}
    </section>

    <section class="section">
      <h2>Bulk Donation Batch Report</h2>
      <div class="inline no-print">
        <label>Select Batch<select id="batch-report-select"><option value="">Select batch</option>${batchOptions}</select></label>
      </div>
      <div id="batch-report-out"></div>
    </section>

    <section class="section">
      <h2>Acquisitions Summary</h2>
      <div class="toolbar">
        <select id="sum-source"><option value="">All Sources</option>${allSources().map((s) => `<option>${s}</option>`)}</select>
        <select id="sum-status"><option value="">All Statuses</option>${allStatuses().map((s) => `<option>${s}</option>`)}</select>
        <input id="sum-start" type="date" />
        <input id="sum-end" type="date" />
        <input id="sum-donor" placeholder="Donor" />
        <input id="sum-vendor" placeholder="Vendor" />
        <input id="sum-memorial" placeholder="Memorial" />
        <input id="sum-adopted" placeholder="Adopted author" />
      </div>
      <div id="summary-out"></div>
    </section>
  `;

  const renderBatch = (batchId) => {
    const batchItems = state.items.filter((i) => i.batchId === batchId);
    const stats = {
      approved: batchItems.filter((i) => i.status === "Approved").length,
      rejected: batchItems.filter((i) => i.status === "Rejected").length,
      considered: batchItems.filter((i) => i.status === "Being considered").length
    };
    document.getElementById("batch-report-out").innerHTML = `
      <p><strong>Counts:</strong> Approved ${stats.approved} | Rejected ${stats.rejected} | Being considered ${stats.considered}</p>
      ${reportTable(["Title", "Author", "Status", "Rejection reason"], batchItems.map((i) => [i.title, i.author, i.status, i.rejectionReason || ""]))}
    `;
  };

  document.getElementById("batch-report-select").addEventListener("change", (e) => renderBatch(e.target.value));
  if (selectedBatch) {
    document.getElementById("batch-report-select").value = selectedBatch;
    renderBatch(selectedBatch);
  }

  const renderSummary = () => {
    const source = document.getElementById("sum-source").value;
    const status = document.getElementById("sum-status").value;
    const start = document.getElementById("sum-start").value;
    const end = document.getElementById("sum-end").value;
    const donor = document.getElementById("sum-donor").value.toLowerCase();
    const vendor = document.getElementById("sum-vendor").value.toLowerCase();
    const memorial = document.getElementById("sum-memorial").value.toLowerCase();
    const adopted = document.getElementById("sum-adopted").value.toLowerCase();

    const rows = state.items
      .filter((i) => {
        const date = i.dateReceived || i.orderDate || "";
        return (
          (!source || i.source === source) &&
          (!status || i.status === status) &&
          (!start || date >= start) &&
          (!end || date <= end) &&
          (!donor || (i.donor || "").toLowerCase().includes(donor)) &&
          (!vendor || (i.vendor || "").toLowerCase().includes(vendor)) &&
          (!memorial || (i.memorialInfo || "").toLowerCase().includes(memorial)) &&
          (!adopted || (i.adoptedAuthorInfo || "").toLowerCase().includes(adopted))
        );
      })
      .map((i) => [i.title, i.author, i.source || "", i.status || "", i.vendor || i.donor || "", i.dateReceived || i.orderDate || ""]);

    document.getElementById("summary-out").innerHTML = reportTable(
      ["Title", "Author", "Source", "Status", "Vendor/Donor", "Date"],
      rows
    );
  };

  ["sum-source", "sum-status", "sum-start", "sum-end", "sum-donor", "sum-vendor", "sum-memorial", "sum-adopted"].forEach((idStr) => {
    document.getElementById(idStr).addEventListener("input", renderSummary);
  });
  renderSummary();
}

function reportTable(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headers.length}">No results.</td></tr>`
  }</tbody></table></div>`;
}

function renderPrintSlips() {
  appEl.innerHTML = `
    <section class="section no-print">
      <h2>Print Processing Slips</h2>
      <p>Select one or more items. Print layout is compact and printer-friendly.</p>
      <div class="toolbar">
        <input id="slip-search" placeholder="Search title / author / ISBN" />
        <button id="print-btn" class="primary">Print Selected</button>
      </div>
      <div id="slip-picker"></div>
    </section>
    <section class="section" id="slip-preview"></section>
  `;

  const renderPicker = () => {
    const q = document.getElementById("slip-search").value.toLowerCase();
    const rows = state.items
      .filter((i) => [i.title, i.author, i.isbn].join(" ").toLowerCase().includes(q))
      .map(
        (i) =>
          `<label><input type="checkbox" value="${i.id}" class="slip-check"/> ${i.title} — ${i.author} <span class="badge">${i.status || ""}</span></label>`
      )
      .join("<br>");
    document.getElementById("slip-picker").innerHTML = rows || "No items.";
  };

  const renderPreview = () => {
    const ids = [...document.querySelectorAll(".slip-check:checked")].map((el) => el.value);
    const slips = state.items.filter((i) => ids.includes(i.id));
    document.getElementById("slip-preview").innerHTML = slips
      .map(
        (i) => `<article class="slip">
      <header class="slip-header">
        <strong>${i.title}</strong>
        <span class="badge">${i.status || "No status"}</span>
      </header>
      ${i.coverImage ? `<img class="detail-cover" src="${escapeHtml(i.coverImage)}" alt="Cover for ${escapeHtml(i.title || "item")}" />` : ""}
      <div class="slip-meta">
        <span><strong>Author:</strong> ${i.author || "—"}</span>
        <span><strong>ISBN:</strong> ${i.isbn || "—"}</span>
        <span><strong>Source:</strong> ${i.source || "—"}</span>
        <span><strong>Order #:</strong> ${i.orderNumber || "—"}</span>
        <span><strong>Vendor/Donor:</strong> ${i.vendor || i.donor || "—"}</span>
        <span><strong>Received:</strong> ${i.dateReceived || i.orderDate || "—"}</span>
      </div>
      ${
        i.memorialInfo || i.adoptedAuthorInfo || i.slipNotes
          ? `<div class="slip-notes">
            ${i.memorialInfo ? `<div><strong>Memorial:</strong> ${i.memorialInfo}</div>` : ""}
            ${i.adoptedAuthorInfo ? `<div><strong>Adopted Author:</strong> ${i.adoptedAuthorInfo}</div>` : ""}
            ${i.slipNotes ? `<div><strong>Slip Notes:</strong> ${i.slipNotes}</div>` : ""}
          </div>`
          : ""
      }
      <div class="slip-staff">
        <div>Cataloged by: ____________________</div>
        <div>Shelved by: ____________________</div>
      </div>
    </article>`
      )
      .join("");
  };

  document.getElementById("slip-search").addEventListener("input", renderPicker);
  document.getElementById("print-btn").addEventListener("click", () => window.print());

  renderPicker();
  appEl.addEventListener("change", (e) => {
    if (e.target.classList.contains("slip-check")) renderPreview();
  });
}

function renderSettings() {
  appEl.innerHTML = `
    <section class="section">
      <h2>Settings / Lookup Values</h2>
      <p>Manage additional statuses and sources without changing code.</p>
      <div class="grid two">
        <form id="status-form" class="section">
          <h3>Status Values</h3>
          <div>${allStatuses().map((s) => `<div>${s}</div>`).join("")}</div>
          <div class="inline"><input name="status" placeholder="Add status" /><button type="submit">Add</button></div>
        </form>
        <form id="source-form" class="section">
          <h3>Source Values</h3>
          <div>${allSources().map((s) => `<div>${s}</div>`).join("")}</div>
          <div class="inline"><input name="source" placeholder="Add source" /><button type="submit">Add</button></div>
        </form>
      </div>
    </section>
  `;

  document.getElementById("status-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get("status").toString().trim();
    if (value && !allStatuses().includes(value)) {
      state.lookupOverrides.statuses.push(value);
      saveState();
      renderSettings();
    }
  });

  document.getElementById("source-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get("source").toString().trim();
    if (value && !allSources().includes(value)) {
      state.lookupOverrides.sources.push(value);
      saveState();
      renderSettings();
    }
  });
}

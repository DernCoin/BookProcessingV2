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
  "Add Item",
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
  if (raw) return JSON.parse(raw);

  const now = new Date().toISOString();
  return {
    items: [],
    batches: [],
    history: [],
    lookupOverrides: { statuses: [], sources: [] },
    createdAt: now
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
    case "Add Item":
      return renderAddItem();
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

function renderAddItem() {
  const statuses = allStatuses();
  const sources = allSources();
  const batchOptions = state.batches.map((b) => `<option value="${b.id}">${b.batchName}</option>`).join("");

  appEl.innerHTML = `
    <section class="section">
      <h2>Add New Item</h2>
      <form id="item-form" class="grid">
        <label>Title<input required name="title" /></label>
        <label>Author<input required name="author" /></label>
        <label>ISBN<input name="isbn" /></label>
        <label>Format
          <select name="format">${LOOKUPS.formats.map((f) => `<option>${f}</option>`).join("")}</select>
        </label>

        <label>Order Number<input name="orderNumber" /></label>
        <label>Order Date<input name="orderDate" type="date" /></label>
        <label>Vendor<input name="vendor" /></label>
        <label>Order Price<input name="orderPrice" type="number" step="0.01" /></label>

        <label>Retail Price<input name="retailPrice" type="number" step="0.01" /></label>
        <label>Donation Source / Donor<input name="donor" /></label>
        <label>Memorial Information<input name="memorialInfo" /></label>
        <label>Adopted Author Information<input name="adoptedAuthorInfo" /></label>

        <label>Status
          <select name="status">${statuses.map((s) => `<option>${s}</option>`).join("")}</select>
        </label>
        <label>Acquisition Source
          <select name="source">${sources.map((s) => `<option>${s}</option>`).join("")}</select>
        </label>
        <label>Date Received<input name="dateReceived" type="date" /></label>
        <label>Date Completed<input name="dateCompleted" type="date" /></label>

        <label>Bulk Donation Batch
          <select name="batchId"><option value="">None</option>${batchOptions}</select>
        </label>
        <label>Rejection Reason<input name="rejectionReason" /></label>
        <label>Damage Notes<input name="damageNotes" /></label>
        <div></div>

        <label style="grid-column: span 2;">Notes<textarea name="notes"></textarea></label>
        <label style="grid-column: span 1;">Processing Notes<textarea name="processingNotes"></textarea></label>
        <label style="grid-column: span 1;">Slip Notes<textarea name="slipNotes"></textarea></label>

        <div class="inline" style="grid-column: span 4; justify-content: flex-end;">
          <button type="reset">Reset</button>
          <button type="submit" class="primary">Save Item</button>
        </div>
      </form>
    </section>
  `;

  const form = document.getElementById("item-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const item = {
      id: id("item"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fd.forEach((v, k) => (item[k] = String(v).trim()));

    state.items.push(item);
    state.history.push({
      id: id("hist"),
      itemId: item.id,
      timestamp: new Date().toISOString(),
      action: `Item created with status ${item.status}`
    });
    saveState();
    form.reset();
    alert("Item saved.");
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
            <option>Being considered</option>
            <option>Approved</option>
            <option>Rejected</option>
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
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Title</th><th>Author</th><th>Source</th><th>Status</th><th>Updated</th><th>Aging</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${
            items
              .map((item) => {
                const days = ageDays(item);
                return `<tr>
                  <td>${item.title || ""}</td>
                  <td>${item.author || ""}</td>
                  <td>${item.source || ""}</td>
                  <td>${item.status || ""}</td>
                  <td>${(item.updatedAt || item.createdAt || "").slice(0, 10)}</td>
                  <td>${agingBadge(days, item.status === "Completed / Shelved")}</td>
                  <td>
                    <div class="status-actions">
                      <button data-action="view" data-id="${item.id}">Details</button>
                      <button data-action="status" data-id="${item.id}">Move</button>
                      <button data-action="damaged" data-id="${item.id}" class="warn">Damaged</button>
                      <button data-action="reject" data-id="${item.id}" class="danger">Reject</button>
                    </div>
                  </td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="7">No items found.</td></tr>`
          }
        </tbody>
      </table>
    </div>`;
}

function wireRowActions() {
  document.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = state.items.find((i) => i.id === btn.dataset.id);
      if (!item) return;
      const action = btn.dataset.action;

      if (action === "view") {
        renderItemDetail(item.id);
        return;
      }

      if (action === "status") {
        const next = prompt(`Enter new status for ${item.title}`, item.status);
        if (!next) return;
        updateStatus(item, next, "Manual move");
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
      <form id="edit-form" class="grid">
        ${[
          "title",
          "author",
          "isbn",
          "format",
          "orderNumber",
          "orderDate",
          "vendor",
          "orderPrice",
          "retailPrice",
          "donor",
          "memorialInfo",
          "adoptedAuthorInfo",
          "status",
          "source",
          "dateReceived",
          "dateCompleted",
          "rejectionReason",
          "damageNotes"
        ]
          .map(
            (k) =>
              `<label>${k}<input name="${k}" value="${(item[k] || "").replaceAll('"', "&quot;")}"/></label>`
          )
          .join("")}
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
      <strong>${i.title}</strong><br>
      <span>Author: ${i.author || ""}</span><br>
      <span>Status: ${i.status || ""}</span><br>
      <span>Source: ${i.source || ""}</span><br>
      ${i.memorialInfo ? `<span>Memorial: ${i.memorialInfo}</span><br>` : ""}
      ${i.adoptedAuthorInfo ? `<span>Adopted Author: ${i.adoptedAuthorInfo}</span><br>` : ""}
      ${i.slipNotes ? `<span>Slip Notes: ${i.slipNotes}</span><br>` : ""}
      <span>Staff Notes: _____________________________</span>
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

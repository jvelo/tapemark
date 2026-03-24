// tapemark — client-side interactivity

// <tm-confirm-button> web component
// Wraps a button and intercepts clicks to show a confirm dialog.
class TmConfirmButton extends HTMLElement {
  connectedCallback() {
    const button = this.querySelector("button, input[type=submit]");
    if (!button) return;

    button.addEventListener("click", (e) => {
      const message = this.getAttribute("data-message") || "Are you sure?";
      if (!confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }
}

if (!customElements.get("tm-confirm-button")) {
  customElements.define("tm-confirm-button", TmConfirmButton);
}

// <tm-display-options> web component
// Renders option inputs based on the selected display type's JSON Schema.
// Reads schemas from a global data attribute and swaps inputs when the
// associated select changes.
class TmDisplayOptions extends HTMLElement {
  connectedCallback() {
    const colName = this.getAttribute("data-column");
    const selectName = colName + "__display";
    const select = this.closest("tr")?.querySelector(`select[name="${selectName}"]`);
    if (!select) return;

    // Parse schemas from the hidden script tag
    const schemasEl = document.getElementById("tm-display-schemas");
    if (!schemasEl) return;
    let schemas;
    try {
      schemas = JSON.parse(schemasEl.textContent || "{}");
    } catch { return; }

    // Parse current options
    let currentOptions = {};
    try {
      currentOptions = JSON.parse(this.getAttribute("data-options") || "{}");
    } catch {}

    const render = () => {
      const type = select.value;
      const schema = schemas[type];
      this.innerHTML = "";
      // Skip options for text (default type, rarely configured)
      if (type === "text") return;
      if (!schema || !schema.properties) return;

      const props = schema.properties;
      for (const [key, prop] of Object.entries(props)) {
        const fieldName = colName + "__opt__" + key;
        const currentVal = currentOptions[key];
        const wrapper = document.createElement("div");
        wrapper.className = "tm-opt-field";

        const desc = prop.description || key;

        let input;
        if (prop.type === "boolean") {
          input = document.createElement("input");
          input.type = "checkbox";
          input.name = fieldName;
          input.value = "1";
          input.title = desc;
          if (currentVal !== undefined ? currentVal : prop.default) {
            input.checked = true;
          }
          // Booleans need a visible label next to the checkbox
          const label = document.createElement("label");
          label.textContent = desc;
          label.setAttribute("for", fieldName);
          wrapper.appendChild(input);
          wrapper.appendChild(label);
          input.id = fieldName;
          this.appendChild(wrapper);
          continue;
        } else if (prop.type === "number") {
          input = document.createElement("input");
          input.type = "number";
          input.name = fieldName;
          input.step = "any";
          input.value = currentVal !== undefined ? String(currentVal) : "";
          input.placeholder = desc;
          input.title = desc;
        } else {
          input = document.createElement("input");
          input.type = "text";
          input.name = fieldName;
          input.value = currentVal !== undefined ? String(currentVal) : "";
          input.placeholder = desc;
          input.title = desc;
        }

        input.id = fieldName;
        wrapper.appendChild(input);
        this.appendChild(wrapper);
      }
    };

    render();
    select.addEventListener("change", () => {
      currentOptions = {};
      render();
    });
  }
}

if (!customElements.get("tm-display-options")) {
  customElements.define("tm-display-options", TmDisplayOptions);
}

// <tm-image-cell> web component
// Renders a thumbnail with hover preview. The preview <img> is only
// created on first hover, avoiding ghost images in the DOM.
class TmImageCell extends HTMLElement {
  connectedCallback() {
    const src = this.getAttribute("data-src");
    const height = this.getAttribute("data-height") || "48";
    const previewHeight = this.getAttribute("data-preview") || "240";
    if (!src) return;

    this.classList.add("tm-cell-image");

    const thumb = document.createElement("img");
    thumb.src = src;
    thumb.loading = "lazy";
    thumb.alt = "";
    thumb.style.height = height + "px";
    thumb.style.width = "auto";
    thumb.style.display = "block";
    this.appendChild(thumb);

    let preview = null;

    this.addEventListener("mouseenter", () => {
      if (!preview) {
        preview = document.createElement("img");
        preview.src = src;
        preview.alt = "";
        preview.className = "tm-cell-image-preview";
        preview.style.maxHeight = previewHeight + "px";
        this.appendChild(preview);
      }
      preview.style.display = "block";
    });

    this.addEventListener("mouseleave", () => {
      if (preview) preview.style.display = "none";
    });
  }
}

if (!customElements.get("tm-image-cell")) {
  customElements.define("tm-image-cell", TmImageCell);
}

// <tm-modal> web component
// Generic modal shell. Create imperatively or in HTML:
//   const modal = document.createElement("tm-modal");
//   modal.setAttribute("data-title", "pick something");
//   document.body.appendChild(modal);
//   modal.open();
//
// Provides .modalBody, .modalFooter, .modalHeaderSlot for populating content.
// Dispatches "tm-modal-close" event when closed.
class TmModal extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this._overlay = document.createElement("div");
    this._overlay.className = "tm-modal-overlay";

    const panel = document.createElement("div");
    panel.className = "tm-modal";

    const header = document.createElement("div");
    header.className = "tm-modal-header";

    const headerTop = document.createElement("div");
    headerTop.className = "tm-modal-header-top";

    const title = document.createElement("span");
    title.className = "tm-modal-title";
    title.textContent = this.getAttribute("data-title") || "";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tm-modal-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", () => this.close());

    headerTop.appendChild(title);
    headerTop.appendChild(closeBtn);

    this._headerSlot = document.createElement("div");
    this._headerSlot.className = "tm-modal-header-slot";

    header.appendChild(headerTop);
    header.appendChild(this._headerSlot);

    this._body = document.createElement("div");
    this._body.className = "tm-modal-body";

    this._footer = document.createElement("div");
    this._footer.className = "tm-modal-footer";

    panel.appendChild(header);
    panel.appendChild(this._body);
    panel.appendChild(this._footer);
    this._overlay.appendChild(panel);

    this._overlay.addEventListener("click", (e) => {
      if (e.target === this._overlay) this.close();
    });

    this._escHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    };
  }

  get modalBody() { return this._body; }
  get modalFooter() { return this._footer; }
  get modalHeaderSlot() { return this._headerSlot; }

  open() {
    document.body.appendChild(this._overlay);
    // Force layout then animate
    this._overlay.offsetHeight;
    this._overlay.classList.add("is-open");
    document.addEventListener("keydown", this._escHandler);
  }

  close() {
    this._overlay.classList.remove("is-open");
    this._overlay.addEventListener("transitionend", () => {
      this._overlay.remove();
    }, { once: true });
    document.removeEventListener("keydown", this._escHandler);
    this.dispatchEvent(new Event("tm-modal-close"));
  }
}

if (!customElements.get("tm-modal")) {
  customElements.define("tm-modal", TmModal);
}

// <tm-reference-input> web component
// Searchable select for foreign key fields. Fetches options from the _lookup endpoint.
// Includes an inline dropdown for quick selection and a browse modal for full table browsing.
class TmReferenceInput extends HTMLElement {
  connectedCallback() {
    const table = this.getAttribute("data-table");
    const column = this.getAttribute("data-column");
    const currentValue = this.getAttribute("data-value") || "";
    const labelColumn = this.getAttribute("data-label-column");
    if (!table || !column) return;

    const hidden = this.querySelector("input[type=hidden]");
    if (!hidden) return;

    // --- DOM setup ---
    const wrapper = document.createElement("div");
    wrapper.className = "tm-ref-wrapper";

    const inputRow = document.createElement("div");
    inputRow.className = "tm-ref-input-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tm-ref-search";
    input.placeholder = "type to search\u2026";
    input.autocomplete = "off";

    const browseBtn = document.createElement("button");
    browseBtn.type = "button";
    browseBtn.className = "tm-ref-browse-btn";
    browseBtn.title = `browse ${table}`;
    browseBtn.textContent = "\u2026";

    const dropdown = document.createElement("div");
    dropdown.className = "tm-ref-dropdown";

    const display = document.createElement("span");
    display.className = "tm-ref-display";

    inputRow.appendChild(display);
    inputRow.appendChild(input);
    inputRow.appendChild(browseBtn);
    wrapper.appendChild(inputRow);
    wrapper.appendChild(dropdown);
    this.appendChild(wrapper);

    // --- State ---
    let debounceTimer = null;
    let activeIndex = -1;
    let open = false;
    let totalRows = null;

    // --- Dropdown helpers ---
    const show = () => { dropdown.classList.add("is-open"); open = true; };
    const hideDropdown = () => {
      dropdown.classList.remove("is-open");
      open = false;
      activeIndex = -1;
      clearHighlight();
    };

    const setSelected = () => { this.classList.add("has-value"); input.hidden = true; };
    const setEditing = () => { this.classList.remove("has-value"); input.hidden = false; };

    const clearHighlight = () => {
      dropdown.querySelectorAll(".tm-ref-option").forEach((el) =>
        el.classList.remove("is-active")
      );
    };
    const highlightIndex = (i) => {
      const items = dropdown.querySelectorAll(".tm-ref-option");
      if (items.length === 0) return;
      activeIndex = Math.max(0, Math.min(i, items.length - 1));
      clearHighlight();
      items[activeIndex].classList.add("is-active");
      items[activeIndex].scrollIntoView({ block: "nearest" });
    };

    // --- Fetch helpers ---
    const buildUrl = (params) => {
      const prefix = window.__tapemarkPrefix || "";
      return `${prefix}/${table}/_lookup?${params}`;
    };

    const fetchSearch = async (query, limit = 20, offset = 0) => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (query) params.set("q", query);
      if (labelColumn) params.set("label", labelColumn);
      const resp = await fetch(buildUrl(params));
      if (!resp.ok) return { results: [], total: 0 };
      return resp.json();
    };

    const fetchByValue = async (value) => {
      const params = new URLSearchParams({ value: String(value) });
      if (labelColumn) params.set("label", labelColumn);
      const resp = await fetch(buildUrl(params));
      if (!resp.ok) return { results: [], total: 0 };
      return resp.json();
    };

    const isLargeTable = () => totalRows !== null && totalRows > 50;

    // --- Dropdown rendering ---
    const renderOptions = (results, total) => {
      dropdown.innerHTML = "";
      activeIndex = -1;
      if (results.length === 0) {
        const hint = document.createElement("div");
        hint.className = "tm-ref-hint";
        hint.textContent = "no results";
        dropdown.appendChild(hint);
        show();
        return;
      }
      for (const opt of results) {
        const item = document.createElement("div");
        item.className = "tm-ref-option";
        item.textContent = opt.label || String(opt.value);
        item.dataset.value = String(opt.value);
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          selectOpt(opt);
        });
        dropdown.appendChild(item);
      }
      if (results.length < total) {
        const hint = document.createElement("div");
        hint.className = "tm-ref-hint";
        hint.textContent = `showing ${results.length} of ${total} \u2014 type to narrow`;
        dropdown.appendChild(hint);
      }
      show();
    };

    const selectOpt = (opt) => {
      hidden.value = String(opt.value);
      display.textContent = opt.label || String(opt.value);
      setSelected();
      input.value = "";
      hideDropdown();
    };

    const clearSelection = () => {
      setEditing();
      input.focus();
    };

    // --- Initial state ---
    if (currentValue) {
      display.textContent = currentValue;
      setSelected();
      fetchByValue(currentValue).then((data) => {
        if (data.results.length > 0 && data.results[0].label) {
          display.textContent = data.results[0].label;
        }
      });
    } else {
      setEditing();
    }

    const ensureTotal = async () => {
      if (totalRows !== null) return;
      const data = await fetchSearch("");
      totalRows = data.total;
      return data;
    };

    // --- Inline dropdown events ---
    display.addEventListener("click", clearSelection);

    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const data = await fetchSearch(input.value);
        if (totalRows === null) totalRows = data.total;
        renderOptions(data.results, data.total);
      }, 150);
    });

    input.addEventListener("focus", async () => {
      const data = await ensureTotal();
      if (!isLargeTable() && data) {
        renderOptions(data.results, data.total);
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) {
          fetchSearch(input.value).then((data) => {
            renderOptions(data.results, data.total);
          });
          return;
        }
        highlightIndex(activeIndex + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (open) highlightIndex(activeIndex - 1);
      } else if (e.key === "Enter" && open && activeIndex >= 0) {
        e.preventDefault();
        const items = dropdown.querySelectorAll(".tm-ref-option");
        if (items[activeIndex]) {
          selectOpt({
            value: items[activeIndex].dataset.value,
            label: items[activeIndex].textContent,
          });
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        hideDropdown();
      }
    });

    document.addEventListener("mousedown", (e) => {
      if (open && !wrapper.contains(e.target)) {
        hideDropdown();
      }
    });

    // --- Browse modal ---
    const PAGE_SIZE = 20;

    browseBtn.addEventListener("click", () => {
      hideDropdown();
      openBrowseModal();
    });

    const openBrowseModal = () => {
      const modal = document.createElement("tm-modal");
      modal.setAttribute("data-title", `select from ${table}`);
      // Ensure connectedCallback runs
      document.body.appendChild(modal);

      const body = modal.modalBody;
      const footer = modal.modalFooter;
      const headerSlot = modal.modalHeaderSlot;
      const close = () => modal.close();

      modal.open();

      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "tm-modal-search";
      searchInput.placeholder = "filter\u2026";
      searchInput.autocomplete = "off";
      headerSlot.appendChild(searchInput);

      let currentPage = 0;
      let currentQuery = "";
      let modalDebounce = null;

      const loadPage = async (page, query) => {
        currentPage = page;
        currentQuery = query;
        body.innerHTML = '<div class="tm-ref-hint">loading\u2026</div>';

        const data = await fetchSearch(query, PAGE_SIZE, page * PAGE_SIZE);
        const totalPages = Math.ceil(data.total / PAGE_SIZE);

        body.innerHTML = "";

        if (data.results.length === 0) {
          body.innerHTML = '<div class="tm-ref-hint">no results</div>';
        } else {
          const tbl = document.createElement("table");
          tbl.className = "tm-modal-table";
          for (const opt of data.results) {
            const tr = document.createElement("tr");
            tr.className = "tm-modal-row";

            const tdValue = document.createElement("td");
            tdValue.className = "tm-modal-cell-value";
            tdValue.textContent = String(opt.value);

            const tdLabel = document.createElement("td");
            tdLabel.className = "tm-modal-cell-label";
            tdLabel.textContent = opt.label || String(opt.value);

            tr.appendChild(tdValue);
            tr.appendChild(tdLabel);

            tr.addEventListener("click", () => {
              selectOpt(opt);
              close();
            });

            tbl.appendChild(tr);
          }
          body.appendChild(tbl);
        }

        // Footer: pagination
        footer.innerHTML = "";
        const info = document.createElement("span");
        info.className = "tm-modal-info";
        const start = page * PAGE_SIZE + 1;
        const end = Math.min((page + 1) * PAGE_SIZE, data.total);
        info.textContent = data.total > 0
          ? `${start}\u2013${end} of ${data.total}`
          : "0 results";
        footer.appendChild(info);

        if (totalPages > 1) {
          const nav = document.createElement("span");
          nav.className = "tm-modal-nav";

          const prevBtn = document.createElement("button");
          prevBtn.type = "button";
          prevBtn.className = "tm-btn";
          prevBtn.textContent = "\u2190";
          prevBtn.disabled = page === 0;
          prevBtn.addEventListener("click", () => loadPage(page - 1, currentQuery));

          const nextBtn = document.createElement("button");
          nextBtn.type = "button";
          nextBtn.className = "tm-btn";
          nextBtn.textContent = "\u2192";
          nextBtn.disabled = page >= totalPages - 1;
          nextBtn.addEventListener("click", () => loadPage(page + 1, currentQuery));

          nav.appendChild(prevBtn);
          nav.appendChild(nextBtn);
          footer.appendChild(nav);
        }
      };

      searchInput.addEventListener("input", () => {
        clearTimeout(modalDebounce);
        modalDebounce = setTimeout(() => {
          loadPage(0, searchInput.value);
        }, 150);
      });

      loadPage(0, "");
      searchInput.focus();
    };
  }
}

if (!customElements.get("tm-reference-input")) {
  customElements.define("tm-reference-input", TmReferenceInput);
}

// Select-all checkbox and bulk delete button wiring
document.addEventListener("DOMContentLoaded", () => {
  const selectAll = document.getElementById("tm-select-all");
  const bulkDeleteBtn = document.getElementById("tm-bulk-delete-btn");

  if (!selectAll || !bulkDeleteBtn) return;

  const checkboxes = () =>
    document.querySelectorAll('.tm-row-select:not(#tm-select-all)');

  function updateBulkButton() {
    const any = Array.from(checkboxes()).some((cb) => cb.checked);
    bulkDeleteBtn.disabled = !any;
  }

  selectAll.addEventListener("change", () => {
    checkboxes().forEach((cb) => {
      cb.checked = selectAll.checked;
    });
    updateBulkButton();
  });

  document.addEventListener("change", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("tm-row-select")) {
      updateBulkButton();
    }
  });
});

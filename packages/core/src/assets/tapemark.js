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

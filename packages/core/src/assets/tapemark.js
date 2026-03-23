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

        const label = document.createElement("label");
        label.textContent = prop.description || key;
        label.setAttribute("for", fieldName);
        wrapper.appendChild(label);

        let input;
        if (prop.type === "boolean") {
          input = document.createElement("input");
          input.type = "checkbox";
          input.name = fieldName;
          input.value = "1";
          if (currentVal !== undefined ? currentVal : prop.default) {
            input.checked = true;
          }
        } else if (prop.type === "number") {
          input = document.createElement("input");
          input.type = "number";
          input.name = fieldName;
          input.step = "any";
          input.value = currentVal !== undefined ? String(currentVal) : (prop.default !== undefined ? String(prop.default) : "");
          input.placeholder = prop.default !== undefined ? String(prop.default) : "";
        } else {
          input = document.createElement("input");
          input.type = "text";
          input.name = fieldName;
          input.value = currentVal !== undefined ? String(currentVal) : (prop.default !== undefined ? String(prop.default) : "");
          input.placeholder = prop.default !== undefined ? String(prop.default) : "";
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

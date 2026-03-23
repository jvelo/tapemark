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

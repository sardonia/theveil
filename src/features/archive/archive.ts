import type { AppState } from "../../domain/types";
import { store } from "../../app/runtime";
import { saveSnapshot } from "../../state/snapshot";
import { showToast } from "../../ui/feedback/toast";

function getArchiveKeys() {
  const indexKey = "reading:archive:index";
  return JSON.parse(localStorage.getItem(indexKey) ?? "[]") as string[];
}

function renderArchiveList() {
  const list = document.querySelector<HTMLElement>("#archive-list");
  if (!list) return;
  const keys = getArchiveKeys();
  if (keys.length === 0) {
    list.innerHTML = '<p class="muted">No saved readings yet.</p>';
    return;
  }
  list.innerHTML = keys
    .map((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return "";
      try {
        const payload = JSON.parse(raw) as AppState["reading"]["current"];
        if (!payload) return "";
        return `
          <button type="button" class="archive-item" data-key="${key}">
            <span>${payload.meta.localeDateLabel}</span>
            <span>${payload.meta.sign}</span>
          </button>
        `;
      } catch {
        return "";
      }
    })
    .join("");

  list.querySelectorAll<HTMLButtonElement>(".archive-item").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key;
      if (!key) return;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as AppState["reading"]["current"];
        if (!payload) return;
        store.applyEvents([{ type: "ReadingGenerated", reading: payload }]);
        saveSnapshot(store.getState());
        toggleArchive(false);
      } catch {
        showToast("Unable to open that saved reading.");
      }
    });
  });
}

export function saveReading(payload: NonNullable<AppState["reading"]["current"]>) {
  const key = `reading:${payload.meta.dateISO}:${payload.meta.sign}`;
  localStorage.setItem(key, JSON.stringify(payload));
  const indexKey = "reading:archive:index";
  const existing = JSON.parse(localStorage.getItem(indexKey) ?? "[]") as string[];
  const next = [key, ...existing.filter((entry) => entry !== key)].slice(0, 60);
  localStorage.setItem(indexKey, JSON.stringify(next));
  showToast("Saved to your archive.");
  renderArchiveList();
}

export function toggleArchive(open: boolean) {
  const modal = document.querySelector<HTMLElement>("#archive-modal");
  if (!modal) return;
  modal.classList.toggle("is-open", open);
  modal.setAttribute("aria-hidden", String(!open));
  if (open) {
    renderArchiveList();
  }
}

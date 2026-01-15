import { isDebugOverlayVisible, setDebugEnabled } from "../../debug/logger";

export function bindDebugToggle() {
  const toggle = document.querySelector<HTMLButtonElement>("#debug-toggle");
  if (!toggle) return;

  const syncState = () => {
    const isOn = isDebugOverlayVisible();
    toggle.classList.toggle("is-on", isOn);
    toggle.setAttribute("aria-pressed", String(isOn));
  };

  syncState();

  toggle.addEventListener("click", () => {
    const nextState = !isDebugOverlayVisible();
    setDebugEnabled(nextState);
    syncState();
  });
}

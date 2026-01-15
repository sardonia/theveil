import { DEFAULT_PROFILE } from "../../domain/constants";
import type { ProfileDraft } from "../../domain/types";
import { debugLog, isDebugEnabled } from "../../debug/logger";
import { commandBus } from "../../app/runtime";
import { updateBirthdateInputState } from "../../ui/forms/profile";

export function bindProfileForm() {
  const form = document.querySelector<HTMLFormElement>("#profile-form");
  if (!form) return;

  // We use our own Specification validation. Disable native HTML validation so
  // WKWebView/Safari quirks (especially around <input type="date">) cannot
  // block the submit event and make the button appear "dead".
  form.noValidate = true;

  const handleReveal = () => {
    const formData = new FormData(form);
    const profile: ProfileDraft = {
      name: String(formData.get("name") ?? "").trim(),
      birthdate: String(formData.get("birthdate") ?? ""),
      mood: String(formData.get("mood") ?? DEFAULT_PROFILE.mood),
      personality: String(formData.get("personality") ?? DEFAULT_PROFILE.personality),
    };
    debugLog("log", "reveal:handle", profile);
    void commandBus.execute({ type: "SubmitProfile", profile }).catch((error) => {
      debugLog("error", "command:SubmitProfile failed", error);
    });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleReveal();
  });

  // Handle the primary button click explicitly as a safety net.
  const revealButton = form.querySelector<HTMLButtonElement>("#reveal-reading");
  if (revealButton && isDebugEnabled()) {
    const rect = revealButton.getBoundingClientRect();
    const style = window.getComputedStyle(revealButton);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const fromPoint = document.elementFromPoint(cx, cy) as HTMLElement | null;
    const fromPointStyle = fromPoint ? window.getComputedStyle(fromPoint) : null;
    debugLog("log", "revealButton:bound", {
      disabled: revealButton.disabled,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      display: style.display,
      opacity: style.opacity,
      hitTestCenter: { x: cx, y: cy },
      hitTestElementFromPoint: fromPoint
        ? {
            tag: fromPoint.tagName,
            id: fromPoint.id || null,
            className: typeof fromPoint.className === "string" ? fromPoint.className : null,
            pointerEvents: fromPointStyle?.pointerEvents,
            zIndex: fromPointStyle?.zIndex,
            display: fromPointStyle?.display,
            opacity: fromPointStyle?.opacity,
          }
        : null,
    });

    revealButton.addEventListener(
      "pointerdown",
      (event) => {
        const e = event as PointerEvent;
        debugLog("log", "revealButton:pointerdown", {
          x: e.clientX,
          y: e.clientY,
          button: e.button,
        });
      },
      true
    );
  }
  revealButton?.addEventListener("click", (event) => {
    event.preventDefault();
    handleReveal();
  });

  const birthInput = form.querySelector<HTMLInputElement>("#birthdate-input");
  if (birthInput) {
    const syncBirthdate = () => updateBirthdateInputState(birthInput);
    syncBirthdate();
    birthInput.addEventListener("input", syncBirthdate);
    birthInput.addEventListener("change", syncBirthdate);
  }
}

import { debugLog, isDebugEnabled } from "../../debug/logger";

export function renderBusy(isGenerating: boolean) {
  const loading = document.querySelector<HTMLElement>("#dashboard-loading");
  const body = document.querySelector<HTMLElement>("#dashboard-body");
  const regenerate = document.querySelector<HTMLButtonElement>("#regenerate");
  const edit = document.querySelector<HTMLButtonElement>("#edit-profile");
  const copy = document.querySelector<HTMLButtonElement>("#copy-reading");

  if (isDebugEnabled()) {
    debugLog("log", "renderBusy", {
      isGenerating,
      hasLoading: Boolean(loading),
      hasBody: Boolean(body),
      hasRegenerate: Boolean(regenerate),
      hasEdit: Boolean(edit),
      hasCopy: Boolean(copy),
    });
  }

  if (loading) {
    loading.hidden = !isGenerating;
  }
  if (body) {
    body.style.opacity = isGenerating ? "0.2" : "1";
    body.classList.toggle("is-loading", isGenerating);
  }

  if (isDebugEnabled()) {
    debugLog("log", "renderBusy:state", {
      isGenerating,
      loadingHidden: loading?.hidden,
      bodyOpacity: body?.style.opacity,
      bodyLoading: body?.classList.contains("is-loading"),
    });
  }
  if (regenerate) regenerate.disabled = isGenerating;
  if (edit) edit.disabled = isGenerating;
  if (copy) copy.disabled = isGenerating;
}

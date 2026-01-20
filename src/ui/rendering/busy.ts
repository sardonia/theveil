import { debugLog, isDebugEnabled } from "../../debug/logger";

export function renderBusy(
  isGenerating: boolean,
  hasReading: boolean,
  hasError: boolean
) {
  const loading = document.querySelector<HTMLElement>("#dashboard-loading");
  const regenerate = document.querySelector<HTMLButtonElement>("#regenerate");
  const edit = document.querySelector<HTMLButtonElement>("#edit-profile");
  const copy = document.querySelector<HTMLButtonElement>("#copy-reading");
  const shouldShow = isGenerating && !hasReading && !hasError;

  if (isDebugEnabled()) {
    debugLog("log", "renderBusy", {
      isGenerating,
      hasReading,
      hasError,
      shouldShow,
      hasLoading: Boolean(loading),
      hasRegenerate: Boolean(regenerate),
      hasEdit: Boolean(edit),
      hasCopy: Boolean(copy),
    });
  }

  if (loading) {
    loading.hidden = !shouldShow;
  }

  if (isDebugEnabled()) {
    debugLog("log", "renderBusy:state", {
      isGenerating,
      hasReading,
      hasError,
      shouldShow,
      loadingHidden: loading?.hidden,
    });
  }
  if (regenerate) regenerate.disabled = shouldShow;
  if (edit) edit.disabled = shouldShow;
  if (copy) copy.disabled = shouldShow;
}

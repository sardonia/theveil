export function renderBusy(isGenerating: boolean) {
  const loading = document.querySelector<HTMLElement>("#reading-loading");
  const body = document.querySelector<HTMLElement>("#reading-body");
  const regenerate = document.querySelector<HTMLButtonElement>("#regenerate");
  const edit = document.querySelector<HTMLButtonElement>("#edit-profile");
  const copy = document.querySelector<HTMLButtonElement>("#copy-reading");

  if (loading) {
    loading.hidden = !isGenerating;
  }
  if (body) {
    body.style.opacity = isGenerating ? "0.2" : "1";
  }
  if (regenerate) regenerate.disabled = isGenerating;
  if (edit) edit.disabled = isGenerating;
  if (copy) copy.disabled = isGenerating;
}

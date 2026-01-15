export function showToast(message: string) {
  const footer = document.querySelector<HTMLElement>(".app__footer");
  if (!footer) return;
  footer.textContent = message;
  window.setTimeout(() => {
    footer.textContent = "For reflection and entertainment. Your intuition matters most.";
  }, 3500);
}

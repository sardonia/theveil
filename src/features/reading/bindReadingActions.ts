import { commandBus, store } from "../../app/runtime";
import { saveReading, toggleArchive } from "../archive/archive";
import { shareReading } from "../share/shareReading";

export function bindReadingActions() {
  document.querySelector("#regenerate")?.addEventListener("click", () => {
    void commandBus.execute({ type: "GenerateReading" });
  });

  document.querySelector("#edit-profile")?.addEventListener("click", () => {
    void commandBus.execute({ type: "EditProfile" });
  });

  document.querySelector("#save-reading")?.addEventListener("click", () => {
    const payload = store.getState().reading.current;
    if (!payload) return;
    saveReading(payload);
  });

  document.querySelector("#share-reading")?.addEventListener("click", () => {
    void shareReading();
  });

  document.querySelector("#open-archive")?.addEventListener("click", () => {
    toggleArchive(true);
  });

  document.querySelector("#archive-close")?.addEventListener("click", () => {
    toggleArchive(false);
  });

  document
    .querySelector(".archive-modal__backdrop")
    ?.addEventListener("click", () => {
      toggleArchive(false);
    });
}

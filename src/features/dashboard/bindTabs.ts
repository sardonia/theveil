export function bindTabs() {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".dashboard__tab");
  const tabScrollTargets: Record<string, string> = {
    today: "#dashboard-primary",
    week: "#weekly-overview",
    month: "#monthly-highlights",
    year: "#year-overview",
    moon: "#cosmic-weather",
    chart: "#compatibility-card",
    journal: "#journal-ritual",
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((btn) => btn.classList.remove("is-active"));
      tab.classList.add("is-active");
      const target = tab.dataset.target;
      if (target && tabScrollTargets[target]) {
        const el = document.querySelector(tabScrollTargets[target]);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

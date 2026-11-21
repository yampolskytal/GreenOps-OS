/** Scrolls to an element (waiting for it to render), focuses it and briefly highlights it. */
export function reveal(id: string, { attempts = 25 }: { attempts?: number } = {}) {
  if (typeof window === "undefined") return;
  let n = 0;
  const tick = () => {
    const el = document.getElementById(id);
    if (!el) {
      if (++n < attempts) setTimeout(tick, 80);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    el.classList.remove("reveal-flash");
    void el.offsetWidth;
    el.classList.add("reveal-flash");
    setTimeout(() => el.classList.remove("reveal-flash"), 1800);
  };
  tick();
}

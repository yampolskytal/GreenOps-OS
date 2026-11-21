/** Run in the actual browser DOM. Source exported for the responsive acceptance runner. */
export function checkComparisonLayout() {
  const tracks = [...document.querySelectorAll("[data-comparison-track]")].filter(
    (el) => el.getBoundingClientRect().width > 0,
  );
  const groups = new Map();
  for (const track of tracks) {
    const container = track.closest(".space-y-4");
    const group = groups.get(container) ?? [];
    group.push(track);
    groups.set(container, group);
  }
  const failures = [];
  for (const rows of groups.values()) {
    const reference = rows[0].getBoundingClientRect();
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (
        Math.abs(rect.left - reference.left) > 1 ||
        Math.abs(rect.right - reference.right) > 1 ||
        Math.abs(rect.width - reference.width) > 1
      )
        failures.push("Track bounds differ");
      const value = Number(row.dataset.value),
        max = Number(row.dataset.maximum);
      const fill = row.firstElementChild;
      if (
        fill &&
        Number.isFinite(value) &&
        max > 0 &&
        Math.abs(parseFloat(fill.style.width) - (Math.max(0, value) / max) * 100) > 0.01
      )
        failures.push("Fill does not use shared maximum");
    }
  }
  return { count: tracks.length, failures };
}

type Point = [number, number];
type Bounds = readonly [x: number, y: number, width: number, height: number];

/** Sample full circles inside the existing country rings, leaving a clear boundary gutter. */
export function geographicDots(outline: string, bounds: Bounds, pitch: number) {
  const [left, top, width, height] = bounds;
  const rings =
    outline.match(/M[^Z]+/g)?.map((ring) =>
      ring
        .slice(1)
        .trim()
        .split(/\s+/)
        .map((point) => point.split(",").map(Number) as Point),
    ) ?? [];
  const edges = rings.flatMap((ring) =>
    ring.map((point, i) => [point, ring[(i + 1) % ring.length]!] as const),
  );
  const clearance = pitch * 0.48;
  const scan = (y: number) =>
    edges
      .flatMap(([[ax, ay], [bx, by]]) =>
        ay > y !== by > y ? [ax + ((bx - ax) * (y - ay)) / (by - ay)] : [],
      )
      .sort((a, b) => a - b);
  const dots: string[] = [];
  for (
    let y = Math.ceil((top + clearance) / pitch) * pitch;
    y <= top + height - clearance;
    y += pitch
  ) {
    const lines = [scan(y - clearance), scan(y), scan(y + clearance)];
    const middle = lines[1]!;
    for (let i = 0; i + 1 < middle.length; i += 2) {
      const start = Math.max(left + clearance, middle[i]! + clearance);
      const end = Math.min(left + width - clearance, middle[i + 1]! - clearance);
      for (let x = Math.ceil(start / pitch) * pitch; x <= end; x += pitch) {
        if (
          lines.every((line) =>
            line.some(
              (edge, index) =>
                index % 2 === 0 &&
                edge + clearance <= x &&
                x <= (line[index + 1] ?? -Infinity) - clearance,
            ),
          )
        )
          dots.push(`M${x.toFixed(2)},${y.toFixed(2)}h.001`);
      }
    }
  }
  return dots.join("");
}

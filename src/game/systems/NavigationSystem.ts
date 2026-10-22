import { distance, type Point, type Rect } from '../types';

/** A deterministic grid graph over hand-authored rooms. Same collision contract as player movement. */
export class NavigationSystem {
  readonly cell = 2;
  constructor(public blockers: Rect[]) {}
  canStand(point: Point, radius = 0.43): boolean {
    if (Math.abs(point.x) > 15.5 - radius || point.z < 1 || point.z > 318) return false;
    return !this.blockers.some((r) => r.active && Math.abs(point.x - r.x) < r.w / 2 + radius && Math.abs(point.z - r.z) < r.d / 2 + radius);
  }
  /** Exact swept player footprint against rectangular walls. Expanded rectangles
   * match canStand(), avoiding hundreds of sampled points for every guide edge.
   * Touching an edge is allowed; crossing its interior is blocked.
   */
  canTraverse(from: Point, to: Point, radius = .43): boolean {
    if (!this.canStand(from, radius) || !this.canStand(to, radius)) return false;
    const dx = to.x - from.x, dz = to.z - from.z;
    for (const rect of this.blockers) {
      if (!rect.active) continue;
      const halfX = rect.w / 2 + radius, halfZ = rect.d / 2 + radius;
      const minX = rect.x - halfX, maxX = rect.x + halfX, minZ = rect.z - halfZ, maxZ = rect.z + halfZ;
      if ((Math.max(from.x, to.x) <= minX || Math.min(from.x, to.x) >= maxX) ||
          (Math.max(from.z, to.z) <= minZ || Math.min(from.z, to.z) >= maxZ)) continue;
      const enterX = dx ? Math.min((minX - from.x) / dx, (maxX - from.x) / dx) : -Infinity;
      const exitX = dx ? Math.max((minX - from.x) / dx, (maxX - from.x) / dx) : Infinity;
      const enterZ = dz ? Math.min((minZ - from.z) / dz, (maxZ - from.z) / dz) : -Infinity;
      const exitZ = dz ? Math.max((minZ - from.z) / dz, (maxZ - from.z) / dz) : Infinity;
      if (Math.max(0, enterX, enterZ) < Math.min(1, exitX, exitZ)) return false;
    }
    return true;
  }
  move(from: Point, delta: Point, radius = 0.43): Point {
    // Substeps prevent running through a thin wall at a low frame rate.
    const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / 0.25));
    let p = { ...from };
    for (let i = 0; i < steps; i++) {
      const dx = delta.x / steps, dz = delta.z / steps;
      if (this.canStand({ x: p.x + dx, z: p.z }, radius)) p.x += dx;
      if (this.canStand({ x: p.x, z: p.z + dz }, radius)) p.z += dz;
    }
    return p;
  }
  path(from: Point, target: Point, area: number): Point[] {
    const key = (p: Point) => `${p.x},${p.z}`;
    const snap = (p: Point) => ({ x: Math.round(p.x / 2) * 2, z: Math.round(p.z / 2) * 2 });
    const start = snap(from), end = snap(target), minZ = area * 64 + 2, maxZ = (area + 1) * 64 - 2;
    const open: Point[] = [start], visited = new Set<string>(), parent = new Map<string, Point>();
    const costs = new Map<string, number>([[key(start), 0]]);
    // A* uses bounded room graphs, avoiding any external navigation library.
    for (let budget = 0; open.length && budget < 900; budget++) {
      open.sort((a, b) => (costs.get(key(a))! + distance(a, end)) - (costs.get(key(b))! + distance(b, end)));
      const current = open.shift()!, id = key(current);
      if (distance(current, end) <= 2.1) {
        const result: Point[] = [this.canStand(target) ? target : current];
        let cursor = current;
        while (parent.has(key(cursor))) { result.unshift(cursor); cursor = parent.get(key(cursor))!; }
        return result;
      }
      visited.add(id);
      for (const delta of [{ x: 2, z: 0 }, { x: -2, z: 0 }, { x: 0, z: 2 }, { x: 0, z: -2 }]) {
        const next = { x: current.x + delta.x, z: current.z + delta.z }, nextId = key(next);
        if (visited.has(nextId) || next.z < minZ || next.z > maxZ || !this.canStand(next, 0.38)) continue;
        const cost = costs.get(id)! + 2;
        if (cost >= (costs.get(nextId) ?? Infinity)) continue;
        costs.set(nextId, cost); parent.set(nextId, current);
        if (!open.some((p) => key(p) === nextId)) open.push(next);
      }
    }
    return []; // Unreachable noise sources do not freeze or teleport a leader.
  }
}

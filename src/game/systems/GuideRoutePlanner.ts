import { distance, type Point } from '../types';
import type { NavigationSystem } from './NavigationSystem';

/** Tutorial-only graph. It never changes patrol navigation or the world's collision data. */
export class GuideRoutePlanner {
  constructor(private readonly navigation: NavigationSystem) {}

  /** Check the entire segment with the player's collision radius, including thin partitions. */
  clear(from: Point, to: Point): boolean {
    return this.navigation.canTraverse(from, to);
  }

  plan(from: Point, target: Point): Point[] {
    // Keep route data limited to coordinates; callers may pass richer mission objects.
    from = { x: from.x, z: from.z }; target = { x: target.x, z: target.z };
    if (this.clear(from, target)) return [{ ...from }, { ...target }];
    const key = (point: Point) => `${point.x},${point.z}`;
    const open: Point[] = [], costs = new Map<string, number>();
    const parent = new Map<string, Point>(), visited = new Set<string>();
    // Connect the actual position to nearby grid nodes without cutting through furniture.
    for (let x = Math.round(from.x) - 1; x <= Math.round(from.x) + 1; x++) {
      for (let z = Math.round(from.z) - 1; z <= Math.round(from.z) + 1; z++) {
        const point = { x, z };
        if (this.clear(from, point)) { open.push(point); costs.set(key(point), distance(from, point)); }
      }
    }
    // The first exit extends into the next chapter so arrows actually lead THROUGH the doorway.
    for (let budget = 0; open.length && budget < 2400; budget++) {
      open.sort((a, b) => costs.get(key(a))! + distance(a, target) - costs.get(key(b))! - distance(b, target));
      const point = open.shift()!, id = key(point);
      if (distance(point, target) <= 1.5 && this.clear(point, target)) {
        const path = [{ ...target }, point];
        let cursor = point;
        while (parent.has(key(cursor))) { cursor = parent.get(key(cursor))!; path.push(cursor); }
        path.push({ ...from }); path.reverse();
        return this.simplify(path);
      }
      visited.add(id);
      for (const delta of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
        const next = { x: point.x + delta.x, z: point.z + delta.z }, nextId = key(next);
        if (Math.abs(next.x) > 15 || next.z < 1 || next.z > 67 || visited.has(nextId) || !this.clear(point, next)) continue;
        const cost = costs.get(id)! + 1;
        if (cost >= (costs.get(nextId) ?? Infinity)) continue;
        costs.set(nextId, cost); parent.set(nextId, point);
        if (!open.some((item) => key(item) === nextId)) open.push(next);
      }
    }
    return []; // Never draw a misleading straight line through an unreachable wall.
  }

  private simplify(path: Point[]): Point[] {
    const result: Point[] = [path[0]];
    let cursor = 0;
    while (cursor < path.length - 1) {
      let next = path.length - 1;
      while (next > cursor + 1 && !this.clear(path[cursor], path[next])) next--;
      result.push(path[next]); cursor = next;
    }
    return result;
  }
}

import { INTERACTABLES } from '../data/levels';
import type { Point, SaveData } from '../types';

export type TutorialId = 'move' | 'shutdown' | 'badge' | 'office-exit' | 'leave';
export interface TutorialStep {
  id: TutorialId;
  index: number;
  title: string;
  target: Point & { id: string; label: string };
  next: string;
  interaction: boolean;
}

const MOVED = 'guided-first-movement';
const destination = (id: string, label: string): TutorialStep['target'] => {
  const object = INTERACTABLES.find((item) => item.id === id)!;
  return { id, label, x: object.x, z: object.z };
};

/** Derive progress from real mission rewards, so continuing/retrying cannot desync the guide. */
export function firstChapterStep(save: SaveData, interactingId?: string): TutorialStep | null {
  if (save.area !== 0) return null;
  if (save.inventory.includes('office-exit')) return { id: 'leave', index: 5, title: '前往会议室走廊', target: { id: 'first-exit', label: '会议区入口', x: 0, z: 65.5 }, next: '进入第二章，新手引导结束', interaction: false };
  if (save.inventory.includes('badge')) return { id: 'office-exit', index: 4, title: '刷工牌，解锁出口', target: destination('office-exit', '门禁读卡器'), next: '穿过出口，进入第二章', interaction: true };
  if (save.inventory.includes('shutdown')) return { id: 'badge', index: 3, title: '取回你的工牌', target: destination('badge', '你的工牌'), next: '到出口读卡器刷卡开门', interaction: true };
  if (!save.tutorial.includes(MOVED) && interactingId !== 'shutdown') return { id: 'move', index: 1, title: '先学会移动', target: destination('shutdown', '你的电脑'), next: '关闭电脑，开始下班', interaction: false };
  return { id: 'shutdown', index: 2, title: '关闭你的电脑', target: destination('shutdown', '你的电脑'), next: '去取回通行工牌', interaction: true };
}

/** Only successful player movement counts; wall pushing, time passing and fixture teleports do not. */
export class TutorialSystem {
  private travelled = 0;
  reset(): void { this.travelled = 0; }
  recordMovement(save: SaveData, amount: number): boolean {
    if (save.area !== 0 || save.tutorial.includes(MOVED) || !Number.isFinite(amount)) return false;
    this.travelled += Math.max(0, amount);
    if (this.travelled < 0.8) return false;
    save.tutorial.push(MOVED);
    return true;
  }
}

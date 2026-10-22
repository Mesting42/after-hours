import type { Area, Difficulty, Interactable, LeaderKind, Point } from '../types';

/** All mission progression is data-driven. Requirements are inventory flag IDs. */
export const AREAS: Area[] = [
  { id: 0, name: '开放办公区', english: 'OPEN OFFICE', subtitle: '最后一封邮件，已经发出。', start: 0, end: 64, color: '#799b9c', checkpoint: { x: -8, z: 5 }, objectives: ['电脑关机', '取回工牌', '解除办公区门锁'], exitRequires: ['office-exit'], hint: '先到自己的工位关机。柜子的背后能暂时藏身。' },
  { id: 1, name: '会议室走廊', english: 'MEETING WING', subtitle: '玻璃另一边，会议还没结束。', start: 64, end: 128, color: '#9294af', checkpoint: { x: 0, z: 69 }, objectives: ['阅读会议便签', '取出访客通行证', '解除会议区门锁'], exitRequires: ['meeting-exit'], hint: '玻璃不会阻挡视线。贴着实墙走，观察巡视领导。' },
  { id: 2, name: '茶水间 / 打印区', english: 'BREAK & PRINT', subtitle: '别让打印机替你打招呼。', start: 128, end: 192, color: '#a09679', checkpoint: { x: 0, z: 133 }, objectives: ['接通打印电源', '打印安保路线', '解除后勤区门锁'], exitRequires: ['print-exit'], hint: '打印机会发出噪声。启动之后离开原位，等巡视结束再回来。' },
  { id: 3, name: '人事 / 安保通道', english: 'RESTRICTED ACCESS', subtitle: '一个工牌，还不够让你回家。', start: 192, end: 256, color: '#7d9c85', checkpoint: { x: 0, z: 197 }, objectives: ['读取门禁口令', '授权工牌', '解除安保门锁'], exitRequires: ['security-exit'], hint: '先找人事便签，再输入口令。监控红灯亮起时避开照射区域。' },
  { id: 4, name: '大厅 / 电梯前厅', english: 'THE WAY HOME', subtitle: '电梯就在前面。再安静一点。', start: 256, end: 320, color: '#c7ac79', checkpoint: { x: 0, z: 261 }, objectives: ['恢复电梯供电', '呼叫电梯', '进入电梯'], exitRequires: [], hint: '安保主管的视野更宽。恢复电源，呼叫电梯，等它到达。' },
];

export const INTERACTABLES: Interactable[] = [
  { id: 'shutdown', area: 0, x: -8, z: 8, kind: 'computer', label: '电脑关机', description: '今天的工作到此为止。', requires: [], duration: 4, reward: 'shutdown' },
  { id: 'badge', area: 0, x: 10, z: 32, kind: 'card', label: '取回工牌', description: '工牌放在档案柜边。', requires: ['shutdown'], duration: 1, reward: 'badge' },
  { id: 'office-exit', area: 0, x: -2, z: 59, kind: 'panel', label: '解除办公区门锁', description: '刷工牌打开通往会议区的门。', requires: ['badge'], duration: 3, reward: 'office-exit' },
  { id: 'meeting-note', area: 1, x: -10, z: 81, kind: 'note', label: '阅读会议便签', description: '访客证存放在东侧小会议室。', requires: [], duration: 2, reward: 'meeting-note' },
  { id: 'visitor', area: 1, x: 10, z: 105, kind: 'card', label: '取出访客通行证', description: '用工牌开启访客证储物盒。', requires: ['meeting-note', 'badge'], duration: 3, reward: 'visitor' },
  { id: 'meeting-exit', area: 1, x: -2, z: 123, kind: 'panel', label: '解除会议区门锁', description: '访客证允许进入后勤区域。', requires: ['visitor'], duration: 3, reward: 'meeting-exit' },
  { id: 'print-power', area: 2, x: 10, z: 147, kind: 'panel', label: '接通打印电源', description: '配电箱会发出短促的响声。', requires: [], duration: 4, reward: 'print-power' },
  { id: 'route-map', area: 2, x: -10, z: 170, kind: 'printer', label: '打印安保路线', description: '打印过程会吸引附近领导。', requires: ['print-power'], duration: 8, reward: 'route-map' },
  { id: 'print-exit', area: 2, x: -2, z: 187, kind: 'panel', label: '解除后勤区门锁', description: '路线单附带临时后勤门禁许可。', requires: ['route-map'], duration: 3, reward: 'print-exit' },
  { id: 'security-note', area: 3, x: -10, z: 211, kind: 'note', label: '读取门禁口令', description: '今日访客口令：1800。授权终端在东侧。', requires: ['route-map'], duration: 2, reward: 'security-note' },
  { id: 'authorization', area: 3, x: 10, z: 234, kind: 'computer', label: '授权工牌', description: '输入便签上的四位口令。', requires: ['security-note', 'badge'], duration: 5, reward: 'authorization' },
  { id: 'security-exit', area: 3, x: -2, z: 251, kind: 'panel', label: '解除安保门锁', description: '授权工牌可以通过此处。', requires: ['authorization'], duration: 4, reward: 'security-exit' },
  { id: 'lift-power', area: 4, x: -10, z: 273, kind: 'panel', label: '恢复电梯供电', description: '启动备用电路，电梯厅灯光将亮起。', requires: ['authorization'], duration: 5, reward: 'lift-power' },
  { id: 'lift-call', area: 4, x: 7, z: 300, kind: 'panel', label: '呼叫电梯', description: '电梯到达需要十二秒。可以先寻找掩体。', requires: ['lift-power'], duration: 2, reward: 'lift-call' },
  { id: 'elevator', area: 4, x: 0, z: 314, kind: 'elevator', label: '进入电梯', description: '到这里，你就可以回家了。', requires: ['lift-ready'], duration: 1 },
  // Optional tools are positioned outside the main aisle, offering safer alternative routes.
  ...AREAS.flatMap((area): Interactable[] => [
    { id: `hide-${area.id}-a`, area: area.id, x: -13, z: area.start + 22, kind: 'hide', label: '藏入储物间', description: '完全进入后才会脱离视野。再次互动或移动离开。', requires: [], duration: 0 },
    { id: `hide-${area.id}-b`, area: area.id, x: 13, z: area.start + 46, kind: 'hide', label: '藏在文件柜后', description: '等待警戒平息，再继续前进。', requires: [], duration: 0 },
    { id: `work-${area.id}`, area: area.id, x: -6, z: area.start + 38, kind: 'disguise', label: '假装整理文件', description: '停在工作点可降低部门领导的警戒，安保主管不会被完全骗过。', requires: [], duration: 0 },
  ]),
];

export interface LeaderSpec { id: string; area: number; kind: LeaderKind; name: string; route: Point[] }
export const LEADERS: LeaderSpec[] = AREAS.flatMap((a) => {
  const main: LeaderSpec = { id: `lead-${a.id}`, area: a.id, kind: a.id > 2 ? 'security' : 'department', name: a.id > 2 ? '安保主管' : '部门领导', route: [{ x: 0, z: a.start + 17 }, { x: 0, z: a.start + 49 }, { x: 10, z: a.start + 49 }, { x: 10, z: a.start + 17 }] };
  const roam: LeaderSpec = { id: `roam-${a.id}`, area: a.id, kind: 'roaming', name: '巡视领导', route: [{ x: -10, z: a.start + 14 }, { x: -10, z: a.start + 48 }, { x: 10, z: a.start + 29 }, { x: 0, z: a.start + 54 }] };
  return [main, roam];
});

export const DIFFICULTIES: Record<Difficulty, { label: string; detection: number; decay: number; hearing: number; speed: number; search: number }> = {
  normal: { label: '普通', detection: 0.72, decay: 12, hearing: 0.8, speed: 0.9, search: 10 },
  hard: { label: '硬核', detection: 1.2, decay: 7, hearing: 1.15, speed: 1.12, search: 18 },
};

export const flagLabel = (flag: string): string => INTERACTABLES.find((o) => o.reward === flag)?.label ?? (flag === 'lift-ready' ? '等待电梯到达' : flag);

import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Game } from '../game/Game';
import { distance } from '../game/types';
import { firstChapterStep } from '../game/systems/TutorialSystem';

/** HTML owns readable instructions; the scene guide owns all world-space arrows. */
export class TutorialOverlay {
  private readonly panel: HTMLElement;
  private readonly targetLabel: HTMLElement;
  private announcement = '';
  private targetVisible = false;

  constructor(private readonly hud: HTMLElement, private readonly game: Game) {
    hud.insertAdjacentHTML('beforeend', `
      <details id="first-tutorial" class="first-tutorial" aria-labelledby="tutorial-title" open hidden>
        <summary><span class="tutorial-heading"><span>行动指引</span><span id="tutorial-count"></span></span><strong id="tutorial-title"></strong><span class="tutorial-summary-note">操作提示 <i aria-hidden="true">＋</i></span></summary>
        <div class="tutorial-body">
          <ol class="tutorial-steps" aria-label="第一章教学步骤">${['移动', '关机', '工牌', '开门', '出口'].map((label, i) => `<li><span>${i + 1}</span>${label}</li>`).join('')}</ol>
          <p id="tutorial-instruction"></p>
          <div class="tutorial-destination"><span>沿金色箭头前进</span><strong id="tutorial-distance"></strong></div>
          <p class="tutorial-next">下一步 <span id="tutorial-next"></span></p>
        </div>
        <span id="tutorial-announcement" class="tutorial-sr" role="status" aria-live="polite" aria-atomic="true"></span>
      </details>
      <div id="tutorial-target" class="tutorial-target" aria-hidden="true" hidden><span>当前目标</span><strong id="tutorial-target-name"></strong></div>
    `);
    this.panel = this.element('first-tutorial'); this.targetLabel = this.element('tutorial-target');
    // Compact on first use of a phone-sized viewport; the native summary remains keyboard/touch operable.
    if (typeof matchMedia !== 'undefined' && matchMedia('(max-width:700px), (max-height:500px)').matches) this.panel.removeAttribute('open');
    // Project after rendering so the label tracks camera movement smoothly, even between HUD ticks.
    game.scene.onAfterRenderObservable.add(() => this.positionTarget());
  }

  private element(id: string): HTMLElement { return this.hud.querySelector<HTMLElement>(`#${id}`)!; }
  private text(id: string, value: string): void {
    const node = this.element(id); if (node.textContent !== value) node.textContent = value;
  }

  update(): void {
    const game = this.game, step = firstChapterStep(game.save, game.interaction?.object.id);
    const visible = !!step && game.settings.value.hints && game.phase === 'playing' && game.player.state !== 'Discovered';
    this.panel.hidden = !visible; this.hud.classList.toggle('has-tutorial', visible); this.targetVisible = visible;
    if (!visible || !step) {
      this.targetLabel.hidden = true; this.announcement = '';
      this.hud.querySelector('[data-touch="interact"]')!.classList.remove('tutorial-ready');
      return;
    }
    const touch = getComputedStyle(this.element('touch-controls')).display !== 'none';
    const key = game.settings.value.bindings.interact.replace(/^Key|^Digit/, '');
    const movement = ['up', 'left', 'down', 'right'].map((action) => game.settings.value.bindings[action as 'up' | 'left' | 'down' | 'right'].replace(/^Key|^Digit/, '')).join(' / ');
    const busy = game.interaction?.object.id === step.target.id;
    const ready = step.interaction && game.closestInteractive()?.id === step.target.id;
    let instruction = '';
    if (step.id === 'move') instruction = touch ? '拖动左下角摇杆，沿金色箭头走向你的电脑。' : `按 ${movement} 移动，沿金色箭头走向你的电脑。`;
    else if (step.id === 'leave') instruction = '门已解锁。沿金色箭头穿过出口，前往会议室走廊。';
    else if (busy) instruction = `正在${step.id === 'shutdown' ? '关机' : step.id === 'badge' ? '取回工牌' : '解锁门禁'}，还需 ${Math.max(1, Math.ceil(game.interaction!.object.duration - game.interaction!.progress))} 秒。请保持不动。`;
    else if (ready) instruction = `${touch ? '点击右下角「互动」' : `按 ${key}`}开始${step.id === 'shutdown' ? '关机' : step.id === 'badge' ? '拿工牌' : '刷卡开门'}，等待完成；移动会中断。`;
    else instruction = `沿金色箭头找到「${step.target.label}」，靠近后${touch ? '点击右下角「互动」' : `按 ${key} 互动`}。`;
    if (game.player.state === 'Hiding') instruction = `你正在隐藏。先移动离开隐藏点，再沿金色箭头前进。`;
    this.panel.dataset.step = step.id; this.panel.dataset.ready = String(ready); this.panel.dataset.busy = String(busy);
    this.text('tutorial-count', `${step.index} / 5`); this.text('tutorial-title', step.title);
    this.text('tutorial-instruction', instruction); this.text('tutorial-next', step.next);
    this.text('tutorial-distance', `${step.target.label} · ${Math.ceil(distance(game.player.position, step.target))} m`);
    this.text('tutorial-target-name', step.target.label);
    this.panel.querySelectorAll<HTMLElement>('.tutorial-steps li').forEach((item, i) => {
      item.classList.toggle('complete', i < step.index - 1);
      if (i === step.index - 1) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    });
    // Announce actual stage/availability changes, not distance/countdown updates every tenth second.
    const announcement = `${step.id}/${ready}/${busy}/${touch}`;
    if (this.announcement !== announcement) {
      this.announcement = announcement;
      this.text('tutorial-announcement', `新手引导第 ${step.index} 步：${step.title}。${instruction} 下一步：${step.next}。`);
    }
    this.hud.querySelector('[data-touch="interact"]')!.classList.toggle('tutorial-ready', ready && !busy);
  }

  private positionTarget(): void {
    const game = this.game, target = game.guide.activeTarget;
    if (!this.targetVisible || game.phase !== 'playing' || !target) { this.targetLabel.hidden = true; return; }
    const canvas = game.canvas, width = canvas.clientWidth, height = canvas.clientHeight;
    const projected = Vector3.Project(new Vector3(target.x, 3.05, target.z), Matrix.IdentityReadOnly, game.scene.getTransformMatrix(), game.camera.viewport.toGlobal(width, height));
    const onScreen = projected.z >= 0 && projected.z <= 1 && projected.x > 65 && projected.x < width - 65 && projected.y > 80 && projected.y < height - 90;
    // The 3D pointer still marks the destination when a label would cover essential HUD text.
    const labelWidth = Math.max(120, this.targetLabel.offsetWidth), labelHeight = 60;
    const covered = onScreen && [...this.hud.querySelectorAll<HTMLElement>('.first-tutorial,.hud-tools,.clock,.alert-indicator,.minimap,.touch-actions,.joystick')].some((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && projected.x + labelWidth / 2 > rect.left - 6 && projected.x - labelWidth / 2 < rect.right + 6 && projected.y > rect.top - 6 && projected.y - labelHeight < rect.bottom + 6;
    });
    this.targetLabel.hidden = !onScreen || covered;
    if (onScreen && !covered) this.targetLabel.style.transform = `translate3d(${projected.x}px,${projected.y}px,0) translate(-50%,-100%)`;
  }
}

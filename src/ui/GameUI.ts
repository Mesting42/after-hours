import type { Game } from '../game/Game';
import { AREAS, DIFFICULTIES, INTERACTABLES } from '../game/data/levels';
import { DEFAULT_SETTINGS } from '../game/systems/SettingsManager';
import { clamp, type Action, type Difficulty, type GamePhase, type Settings } from '../game/types';
import { escapeHTML, icon } from './icons';
import { TutorialOverlay } from './TutorialOverlay';
import { MODEL_CREDITS, MODEL_LICENSE, modelSource } from '../game/data/modelCredits';
import { menuView } from './views/MenuView';
import { button } from './views/controls';
import { settingsView, bindSettingsTabs, type SettingsSection } from './views/SettingsView';

export class GameUI {
  private difficulty: Difficulty = 'normal';
  private dialog: HTMLDialogElement;
  private toastTimer = 0;
  private regionTimer = 0;
  private map: CanvasRenderingContext2D;
  private previousFocus: HTMLElement | null = null;
  private lastAlert = '';
  private muted = false;
  private rebindAbort: AbortController | null = null;
  private objectiveMarkup = '';
  private settingsSection: SettingsSection = 'graphics';
  private disposeSettingsTabs: (() => void) | null = null;
  private readonly tutorialOverlay: TutorialOverlay;
  constructor(public root: HTMLElement, private game: Game) {
    root.innerHTML = `
      ${menuView()}
      <section id="hud" class="hud" hidden aria-label="游戏状态与操作">
        <div class="hud-top"><div class="area-label"><span id="area-eyebrow">01 / 05 · OPEN OFFICE</span><strong id="area-name">开放办公区</strong><div id="route-progress" class="route-progress"></div></div><div class="clock"><span>下班时间 18:00</span><strong id="clock">17:55</strong><small id="clock-note">离开前，关掉你的电脑。</small></div><div class="hud-tools"><button id="mute" aria-label="静音" class="icon-button">${icon('sound')}</button><button id="hud-settings" aria-label="游戏设置" class="icon-button">${icon('settings')}</button><button id="pause" aria-label="暂停游戏" class="icon-button">${icon('pause')}</button></div></div>
        <details class="objective" open><summary><span class="small-label">当前目标</span><strong id="objective-name"></strong><span class="disclosure-mark" aria-hidden="true">＋</span></summary><div class="objective-details"><span id="objective-description"></span><ul id="objective-list"></ul></div></details>
        <div id="alert-indicator" class="alert-indicator" role="status">${icon('eye')}<span id="status">暂时安全</span><div class="alert-track"><i id="alert-fill"></i></div><span id="alert-number">0</span></div>
        <div class="minimap"><div><span>楼层导览</span><span id="map-area">01</span></div><canvas id="map" width="200" height="250" aria-label="当前区域地图：白色为墙体，金色为目标，绿色为玩家，橙色为领导"></canvas><span class="map-legend"><i></i>你的位置 <b></b>领导 <em></em>目标</span></div>
        <div id="inventory" class="inventory">${icon('card')}<span>暂无门禁许可</span></div>
        <div class="desktop-controls"><span><kbd>W A S D</kbd>移动</span><span><kbd>C</kbd>蹲伏</span><span><kbd>Shift</kbd>快走</span><span><kbd>E</kbd>互动</span><span><kbd>Q</kbd>干扰</span><span>拖动视角 · 滚轮缩放</span></div>
        <button id="interact-prompt" class="interact-prompt" hidden><span class="interact-key">E</span><span><strong id="interact-name"></strong><small id="interact-note"></small></span><span class="interaction-meter"><i id="interaction-progress"></i></span></button>
        <div id="touch-controls" class="touch-controls"><div id="joystick" class="joystick" aria-label="拖动摇杆移动"><span class="joystick-knob"></span><span class="joystick-label">移动</span></div><div class="touch-actions"><button data-touch="noise" aria-label="使用一次性声音干扰">${icon('sound')}<span>干扰</span></button><button data-touch="hide" aria-label="进入或离开隐藏点">${icon('shield')}<span>隐藏</span></button><button data-touch="run" aria-label="按住快速移动">${icon('run')}<span>快走</span></button><button data-touch="crouch" aria-label="切换蹲伏">${icon('crouch')}<span>蹲伏</span></button><button data-touch="interact" class="touch-interact" aria-label="与附近物体互动">${icon('hand')}<span>互动</span></button></div></div>
        <span id="fps" class="fps" hidden></span>
      </section>
      <div id="region-intro" class="region-intro" hidden><span id="region-index"></span><strong id="region-title"></strong><p id="region-subtitle"></p></div>
      <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
      <div id="discovered-vignette" class="discovered-vignette" hidden aria-hidden="true"></div>
      <dialog id="dialog" aria-labelledby="dialog-title" aria-describedby="panel-description" class="game-dialog"><div id="dialog-body"></div></dialog>
    `;
    this.dialog = root.querySelector<HTMLDialogElement>('#dialog')!;
    this.map = root.querySelector<HTMLCanvasElement>('#map')!.getContext('2d')!;
    this.tutorialOverlay = new TutorialOverlay(this.el('hud'), game);
    this.bind(); game.input.bindTouch(root);
    root.querySelectorAll<HTMLElement>('button[aria-label]').forEach((control) => { control.title = control.getAttribute('aria-label')!; });
    game.connect({ phase: (phase) => this.phase(phase), toast: (message) => this.toast(message), region: (area) => this.region(area), keypad: (callback) => this.keypad(callback) }, () => this.update());
    this.applyVisualSettings(); this.refreshContinue();
    if (game.saves.recovered) this.toast('检测到损坏或不兼容的存档，已恢复为默认状态。');
  }
  private el<T extends HTMLElement = HTMLElement>(id: string): T { return this.root.querySelector<T>(`#${id}`)!; }
  private click(id: string, callback: () => void): void { this.el(id).addEventListener('click', callback); }
  private bind(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => button.addEventListener('click', () => {
      this.difficulty = button.dataset.difficulty as Difficulty;
      this.root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((b) => { const selected = b === button; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected)); });
      this.el('difficulty-note').textContent = this.difficulty === 'normal' ? '清晰引导 · 宽容警戒 · 区域检查点' : '敏锐感知 · 更快巡逻 · 区域检查点';
    }));
    this.click('new-game', () => this.start()); this.click('continue-game', () => this.game.start(this.game.save.difficulty, 0, true));
    this.click('menu-settings', () => this.settings()); this.click('hud-settings', () => { this.game.pause(); this.settings(); });
    this.click('pause', () => this.game.pause()); this.click('level-select', () => this.levels()); this.click('sources', () => this.sources()); this.click('how-to', () => this.help()); this.click('interact-prompt', () => this.game.interact());
    this.click('mute', () => { this.muted = !this.muted; this.game.audio.update({ ...this.game.settings.value, masterVolume: this.muted ? 0 : this.game.settings.value.masterVolume }); this.el('mute').setAttribute('aria-label', this.muted ? '取消静音' : '静音'); this.el('mute').classList.toggle('muted', this.muted); });
    this.dialog.addEventListener('cancel', (event) => { event.preventDefault(); if (this.game.phase === 'paused') this.game.resume(); else if (!['failed', 'victory'].includes(this.game.phase)) this.closeDialog(); });
  }
  /** Save-aware hierarchy changes actual DOM order, so keyboard and visual order agree. */
  private refreshContinue(): void {
    const save = this.game.saves.load(), canContinue = !!save && !save.ending;
    const continueButton = this.el<HTMLButtonElement>('continue-game'), newButton = this.el<HTMLButtonElement>('new-game');
    continueButton.disabled = !canContinue;
    continueButton.classList.toggle('is-primary', canContinue); newButton.classList.toggle('is-primary', !canContinue);
    this.root.querySelector('.menu-actions')!.prepend(canContinue ? continueButton : newButton);
    this.root.querySelectorAll('.menu-action .action-index').forEach((node,i) => { node.textContent = String(i + 1).padStart(2,'0'); });
    this.el('continue-description').textContent = canContinue ? `${AREAS[save.area].name} · ${DIFFICULTIES[save.difficulty].label}` : '还没有可继续的旅程';
    this.el('departure-label').textContent = canContinue ? '上次停留 / CHECKPOINT' : '这层楼，离家不远';
    this.el('departure-title').textContent = canContinue ? `${String(save.area + 1).padStart(2,'0')} · ${AREAS[save.area].name}` : '五个区域，一趟归途。';
    this.el('departure-detail').textContent = canContinue ? '继续已保存的旅程，已完成的任务会保留。' : '关掉电脑。带上工牌。安静地离开。';
  }
  private start(area = 0): void {
    const previous = this.game.saves.load();
    if (previous && !previous.ending && previous.elapsed > 5 && area === 0) {
      this.panel('重新开始旅程', '当前旅程将被新游戏替换。已解锁章节仍然保留。', `<div class="panel-actions">${button('confirm-new', '开始新游戏', 'primary')}${button('cancel-new', '保留当前旅程')}</div>`);
      this.click('confirm-new', () => { this.closeDialog(); this.game.start(this.difficulty); }); this.click('cancel-new', () => this.closeDialog());
    } else { this.closeDialog(); this.game.start(this.difficulty, area); }
  }
  phase(phase: GamePhase): void {
    if (['menu', 'failed', 'victory'].includes(phase)) {
      // Transient chapter/tutorial messages must not leak into a different screen.
      clearTimeout(this.regionTimer); clearTimeout(this.toastTimer);
      this.el('region-intro').hidden = true; this.el('toast').hidden = true;
    }
    this.el('menu').hidden = phase !== 'menu'; this.el('hud').hidden = !['playing', 'escaping'].includes(phase);
    this.el('discovered-vignette').hidden = phase !== 'failed';
    if (phase === 'playing' || phase === 'menu' || phase === 'escaping') this.closeDialog();
    if (phase === 'menu') this.refreshContinue();
    if (phase === 'paused') this.pausePanel();
    if (phase === 'failed') this.failed();
    if (phase === 'victory') this.victory();
    if (phase === 'escaping') { this.el('interact-prompt').hidden = true; this.el('touch-controls').style.visibility = 'hidden'; }
    else this.el('touch-controls').style.visibility = '';
    this.tutorialOverlay.update();
  }
  private panel(title: string, description: string, content: string, wide = false, kind = 'panel'): void {
    this.rebindAbort?.abort(); this.disposeSettingsTabs?.(); this.disposeSettingsTabs = null;
    if (!this.dialog.open) this.previousFocus = document.activeElement as HTMLElement;
    this.dialog.classList.toggle('wide', wide); this.dialog.dataset.kind = kind;
    this.el('dialog-body').innerHTML = `<div class="panel-top"><span class="eyebrow"><i class="status-dot" aria-hidden="true"></i> AFTER HOURS / 27F</span><button id="panel-close" class="icon-button" aria-label="关闭弹窗">${icon('close')}</button></div><h2 id="dialog-title">${title}</h2><p id="panel-description" class="panel-description">${description}</p><p id="dialog-feedback" class="dialog-feedback" role="status" aria-live="polite" hidden></p>${content}`;
    if (!this.dialog.open) this.dialog.showModal();
    const close = this.el<HTMLButtonElement>('panel-close'); close.hidden = this.game.phase === 'failed' || this.game.phase === 'victory';
    close.addEventListener('click', () => { if (this.game.phase === 'paused') this.game.resume(); else this.closeDialog(); });
    this.dialog.querySelector<HTMLElement>('button:not([hidden]),input,select')?.focus();
  }
  private closeDialog(): void { this.rebindAbort?.abort(); this.disposeSettingsTabs?.(); this.disposeSettingsTabs = null; if (this.dialog.open) { this.dialog.close(); this.previousFocus?.focus({ preventScroll: true }); } }
  private pausePanel(): void {
    this.panel('暂时停一停', '办公室还在。时间与巡逻已暂停。', `<div class="panel-actions">${button('resume', '继续旅程', 'primary')}${button('pause-settings', '设置', 'secondary', 'settings')}${button('pause-help', '操作说明')}${button('pause-menu', '保存并回到主菜单', 'quiet', 'home')}</div>`, false, 'pause');
    this.click('resume', () => this.game.resume()); this.click('pause-settings', () => this.settings()); this.click('pause-help', () => this.help()); this.click('pause-menu', () => this.game.menu());
  }
  private failed(): void {
    this.panel('还差一点。', this.game.failReason, `<div class="result-detail"><span>当前检查点</span><strong>${AREAS[this.game.area].name}</strong><p>已完成的区域任务会保留。下一次，先等视线离开。</p></div><div class="panel-actions">${button('retry', '从检查点重试', 'primary')}${button('restart-failed', '重新开始')}${button('failed-menu', '回到主菜单', 'quiet', 'home')}</div>`, false, 'failed');
    this.click('retry', () => this.game.retry()); this.click('restart-failed', () => this.game.start(this.game.save.difficulty)); this.click('failed-menu', () => this.game.menu());
  }
  private victory(): void {
    const elapsed = Math.floor(this.game.clock.elapsed), minutes = Math.floor(elapsed / 60), seconds = elapsed % 60;
    this.panel('你，准点下班了。', '门关上的那一刻，工作也留在了楼上。', `<div class="ending-art">${icon('lift')}<span>1F <small>HOME</small></span></div><div class="ending-stats"><div><span>结局</span><strong>${this.game.save.difficulty === 'hard' ? '无声的专业人士' : '回家的人'}</strong></div><div><span>旅程用时</span><strong>${minutes}分${seconds}秒</strong></div><div><span>难度</span><strong>${DIFFICULTIES[this.game.save.difficulty].label}</strong></div></div><blockquote>明天的事，明天再说。</blockquote><div class="panel-actions">${button('ending-menu', '回到主菜单', 'primary', 'home')}${button('ending-again', '再走一次')}</div>`, false, 'victory');
    this.click('ending-menu', () => this.game.menu()); this.click('ending-again', () => this.game.start(this.game.save.difficulty));
  }
  private levels(): void {
    const unlocks = this.game.saves.load()?.unlocks ?? 0;
    this.panel('选择一段旅程', '区域检查点会解锁对应章节。重玩章节会替换当前旅程。', `<div class="chapter-list">${AREAS.map((area) => `<button data-chapter="${area.id}" ${area.id > unlocks ? 'disabled' : ''}><span>${String(area.id + 1).padStart(2, '0')}</span><div><strong>${area.name}</strong><small>${area.english}</small></div>${area.id > unlocks ? icon('shield') : icon('arrow')}<span class="chapter-state">${area.id > unlocks ? '未解锁' : '可进入'}</span></button>`).join('')}</div>`, false, 'chapters');
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-chapter]').forEach((chapterButton) => chapterButton.addEventListener('click', () => {
      const area = +chapterButton.dataset.chapter!;
      if (area > unlocks) return;
      this.panel('重玩这一章节', `从“${AREAS[area].name}”开始，会替换当前旅程；已解锁章节保留。`, `<div class="panel-actions">${button('chapter-confirm', '开始章节', 'primary')}${button('chapter-cancel', '返回章节选择')}</div>`);
      this.click('chapter-confirm', () => { this.closeDialog(); this.game.start(this.difficulty, area); }); this.click('chapter-cancel', () => this.levels());
    }));
  }
  private help(): void {
    this.panel('安静地离开', '观察、等待、移动。领导的视野与声音都需要留意。', `<div class="help-grid"><div><h3>桌面操作</h3><p><kbd>WASD / ↑↓←→</kbd> 八方向移动</p><p><kbd>Shift</kbd> 按住快走，会产生更多噪声</p><p><kbd>C / Ctrl</kbd> 切换蹲伏</p><p><kbd>E</kbd> 互动 / 取消互动 / 离开隐藏</p><p><kbd>Q</kbd> 一次性声音干扰</p><p><kbd>H</kbd> 隐藏 / 离开隐藏</p><p>鼠标拖拽旋转 · 滚轮缩放 · Esc 暂停</p></div><div><h3>触屏与手柄</h3><p>左侧摇杆移动，拖动场景右侧调整镜头。</p><p>快走按钮需按住；蹲伏、互动、隐藏与干扰为单次点击。</p><p>手柄：左摇杆移动，右摇杆镜头，A 互动、B 蹲伏、X 干扰、Y 隐藏、LB 快走、Start 暂停。</p><h3>警戒规则</h3><p>25 怀疑 · 50 调查 · 75 即将发现 · 100 失败。实墙和高柜阻挡视线，玻璃只阻挡移动。</p><p>躲进蓝色标记的隐藏点，或留在工作点假装忙碌。不要在领导正盯着你时直接隐藏。</p></div></div><div class="panel-actions">${button('help-back', '明白了', 'primary')}</div>`, true, 'help');
    this.click('help-back', () => { if (this.game.phase === 'paused') this.pausePanel(); else this.closeDialog(); });
  }
  private sources(): void {
    const credits = MODEL_CREDITS.map((asset) => `<h3>${escapeHTML(asset.role)} · ${escapeHTML(asset.title)}</h3><p><a href="${modelSource(asset)}" target="_blank" rel="noopener noreferrer">${escapeHTML(asset.author)} / 原始模型</a> · <a href="${MODEL_LICENSE}" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p><p>本项目修改：${escapeHTML(asset.changes)}。</p>`).join('');
    this.panel('素材与来源', '五款外部模型免费开放授权，按 CC BY 4.0 保留署名与修改记录。模型均随项目本地加载。', `<div class="source-list">${credits}<h3>项目原创素材 · CC0 1.0</h3><p>建筑通道、门禁、电梯、指引、图标、地面纹理及六个 PCM 音效由本项目生成。</p><h3>引擎与工具</h3><p>Babylon.js / loaders：Apache-2.0；Vite、Vitest：MIT；TypeScript：Apache-2.0。依赖许可证保留在项目中。</p><h3>字体与完整许可</h3><p>使用设备系统字体，无远程字体。完整记录见 ASSET_SOURCES.md 和随包 licenses 目录。</p></div><div class="panel-actions">${button('sources-back', '返回', 'primary')}</div>`, true, 'sources');
    this.click('sources-back', () => this.closeDialog());
  }
  private keypad(callback: (code: string) => void): void {
    this.panel('工牌授权', '输入人事便签上的四位访客口令。', `<form id="keypad-form"><label class="code-label" for="door-code">访客口令</label><input id="door-code" class="code-input" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="· · · ·" required><div class="panel-actions"><button type="submit" class="button primary"><span>授权工牌</span>${icon('card')}</button><button type="button" id="keypad-cancel" class="button secondary">稍后再来</button></div></form>`);
    this.el<HTMLFormElement>('keypad-form').addEventListener('submit', (event) => {
      event.preventDefault(); const input = this.el<HTMLInputElement>('door-code');
      if (input.value !== '1800') { input.setCustomValidity('口令错误，请查看人事便签上的四位数字。'); input.reportValidity(); return; }
      input.setCustomValidity(''); callback(input.value);
    });
    this.el<HTMLInputElement>('door-code').addEventListener('input', (event) => (event.target as HTMLInputElement).setCustomValidity(''));
    this.click('keypad-cancel', () => this.game.resume()); this.el('door-code').focus();
  }
  private settings(): void {
    const s = this.game.settings.value;
    this.panel('把旅程调成你的节奏', '画面、操作与声音，让办公室按你的习惯运行。', settingsView(s, this.settingsSection), true, 'settings');
    this.disposeSettingsTabs = bindSettingsTabs(this.dialog, this.settingsSection, (section) => { this.settingsSection = section; });
    this.el<HTMLSelectElement>('quality').addEventListener('change', (event) => {
      this.game.settings.preset((event.target as HTMLSelectElement).value as Settings['quality']); this.settingsChanged(); this.settings();
      this.el('quality').focus();
    });
    this.dialog.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => input.addEventListener('input', () => {
      const key = input.dataset.setting as keyof Settings, value = input.type === 'checkbox' ? input.checked : +input.value;
      this.game.settings.update({ [key]: value }); this.dialog.querySelector<HTMLOutputElement>(`[data-output="${key}"]`)?.replaceChildren(String(value)); this.settingsChanged();
    }));
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-rebind]').forEach((button) => button.addEventListener('click', () => {
      this.rebindAbort?.abort(); this.rebindAbort = new AbortController();
      const action = button.dataset.rebind as Action; button.textContent = '按下新键…';
      const listener = (event: KeyboardEvent) => {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.code !== 'Escape') {
          const duplicate = Object.entries(this.game.settings.value.bindings).find(([a, code]) => a !== action && code === event.code);
          if (duplicate) { this.toast('该按键已有绑定，请选择另一个。'); return; }
          this.game.settings.update({ bindings: { ...this.game.settings.value.bindings, [action]: event.code } }); this.settingsChanged();
        }
        button.textContent = this.game.settings.value.bindings[action].replace('Key', ''); this.dialog.removeEventListener('keydown', listener, true);
      };
      this.dialog.addEventListener('keydown', listener, { capture: true, signal: this.rebindAbort.signal });
    }));
    this.click('settings-reset', () => { this.game.settings.update(structuredClone(DEFAULT_SETTINGS)); this.settingsChanged(); this.settings(); });
    this.click('settings-back', () => { if (this.game.phase === 'paused') this.pausePanel(); else this.closeDialog(); });
  }
  private settingsChanged(): void { this.game.applySettings(this.game.settings.value); this.applyVisualSettings(); }
  private applyVisualSettings(): void {
    const s = this.game.settings.value;
    this.root.style.setProperty('--joystick-size', `${s.joystickSize}px`); this.root.style.setProperty('--button-opacity', String(s.buttonOpacity));
    const key = (action: Action) => escapeHTML(s.bindings[action].replace(/^Key/, '').replace(/^(Shift|Control)(Left|Right)$/, '$1').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→'));
    const controls: [string, string][] = [[['up', 'left', 'down', 'right'].map((a) => key(a as Action)).join(' '), '移动'], [key('crouch'), '蹲伏'], [key('run'), '快走'], [key('interact'), '互动'], [key('noise'), '干扰']];
    this.root.querySelector('.desktop-controls')!.innerHTML = controls.map(([binding, label]) => `<span><kbd>${binding}</kbd>${label}</span>`).join('') + '<span>拖动视角 · 滚轮缩放</span>';
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion); document.documentElement.classList.toggle('high-contrast', s.highContrast);
  }
  toast(message: string): void {
    clearTimeout(this.toastTimer);
    // Native modal dialogs make background live regions inert. Show validation
    // feedback inside the active dialog so it remains visible and announced.
    const background = this.el('toast'); background.hidden = true;
    const target = this.dialog.open ? this.el('dialog-feedback') : background;
    target.textContent = message; target.hidden = false;
    this.toastTimer = window.setTimeout(() => { target.hidden = true; }, 5200);
  }
  region(index: number): void {
    clearTimeout(this.regionTimer); const area = AREAS[index];
    this.el('region-index').textContent = `CHAPTER ${String(index + 1).padStart(2, '0')}`; this.el('region-title').textContent = area.name; this.el('region-subtitle').textContent = area.subtitle;
    this.el('region-intro').hidden = false; this.regionTimer = window.setTimeout(() => this.el('region-intro').hidden = true, 2800);
    this.el('area-eyebrow').textContent = `${String(index + 1).padStart(2, '0')} / 05 · ${area.english}`; this.el('area-name').textContent = area.name; this.el('map-area').textContent = String(index + 1).padStart(2, '0');
    this.el('route-progress').innerHTML = AREAS.map((a) => `<i class="${a.id <= index ? 'visited' : ''}"></i>`).join('');
  }
  update(): void {
    if (!['playing', 'escaping'].includes(this.game.phase)) return;
    this.tutorialOverlay.update();
    const game = this.game, area = AREAS[game.area], objective = game.objective;
    this.el('hud').classList.toggle('has-interaction', !!game.nearby || !!game.interaction);
    this.root.classList.toggle('performance-lite', game.settings.value.autoQuality && game.performance.adaptive.level > 0);
    this.el('discovered-vignette').hidden = game.player.state !== 'Discovered';
    this.el('clock').textContent = game.clock.label; this.el('clock-note').textContent = game.clock.afterHours ? '下班后 · 巡逻已加密' : '18:00 后巡逻加密';
    this.el('objective-name').textContent = objective?.label ?? '前往下一区域';
    this.el('objective-description').textContent = game.settings.value.hints ? objective?.description ?? area.hint : '';
    const objectiveMarkup = INTERACTABLES.filter((o) => o.area === game.area && (o.reward || o.kind === 'elevator')).map((o) => `<li class="${game.save.completed.includes(o.id) ? 'complete' : ''}"><i>${game.save.completed.includes(o.id) ? '✓' : ''}</i>${o.label}</li>`).join('');
    // Mission rows change only when progression changes, not on every HUD tick.
    if (objectiveMarkup !== this.objectiveMarkup) { this.el('objective-list').innerHTML = objectiveMarkup; this.objectiveMarkup = objectiveMarkup; }
    this.el('status').textContent = game.status; this.el('alert-fill').style.width = `${game.suspicion}%`; this.el('alert-number').textContent = String(Math.floor(game.suspicion));
    this.el('alert-indicator').dataset.level = game.suspicion > 74 ? 'danger' : game.suspicion > 24 ? 'warning' : 'safe';
    if (this.lastAlert !== game.status && game.suspicion > 24) { this.lastAlert = game.status; }
    const nearby = game.nearby, interaction = game.interaction;
    this.el('interact-prompt').hidden = (!nearby && !interaction) || game.phase !== 'playing';
    if (nearby || interaction) {
      this.el('interact-name').textContent = interaction ? `${interaction.object.label}…` : game.player.state === 'Hiding' ? '离开隐藏点' : nearby!.label;
      this.el('interact-note').textContent = interaction ? '移动或再次互动可取消' : nearby!.description;
      this.el('interaction-progress').style.width = interaction ? `${clamp(interaction.progress / Math.max(0.001, interaction.object.duration) * 100, 0, 100)}%` : '0%';
      this.el('interact-prompt').classList.toggle('busy', !!interaction);
      this.el('interact-prompt').querySelector('.interact-key')!.textContent = game.input.settings.bindings.interact.replace('Key', '');
    }
    this.el('inventory').querySelector('span')!.textContent = game.inventory.has('authorization') ? '授权工牌' : game.inventory.has('visitor') ? '工牌 · 访客证' : game.inventory.has('badge') ? '工牌已取回' : '暂无门禁许可';
    this.el('fps').hidden = !game.settings.value.showFPS; this.el('fps').textContent = `${game.performance.fps} FPS · ${game.engine.getRenderWidth()} × ${game.engine.getRenderHeight()}${game.settings.value.autoQuality ? ' · 自动流畅' : ''}`;
    this.root.querySelector('[data-touch="crouch"]')!.setAttribute('aria-pressed', String(game.player.crouched));
    this.root.querySelector('[data-touch="hide"]')!.setAttribute('aria-pressed', String(game.player.state === 'Hiding'));
    this.root.querySelector('[data-touch="noise"]')!.classList.toggle('used', game.save.distractionUsed);
    this.drawMap();
  }
  private drawMap(): void {
    const ctx = this.map, game = this.game, start = game.area * 64;
    ctx.clearRect(0, 0, 200, 250); ctx.fillStyle = '#161b1e'; ctx.fillRect(0, 0, 200, 250);
    const x = (world: number) => (world + 16) / 32 * 180 + 10, y = (world: number) => 240 - (world - start) / 64 * 230;
    ctx.strokeStyle = '#44474a'; ctx.strokeRect(10, 10, 180, 230);
    for (const wall of game.world.blockers) {
      if (!wall.active || wall.z < start || wall.z > start + 64) continue;
      ctx.fillStyle = wall.w > 8 || wall.d > 10 ? '#747572' : '#41474a'; ctx.fillRect(x(wall.x - wall.w / 2), y(wall.z + wall.d / 2), wall.w / 32 * 180, Math.max(1.5, wall.d / 64 * 230));
    }
    for (const objective of INTERACTABLES.filter((o) => o.area === game.area && !game.save.completed.includes(o.id) && o.kind !== 'disguise')) {
      ctx.fillStyle = objective.kind === 'hide' ? '#a6c3c1' : '#dda65a'; ctx.fillRect(x(objective.x) - 2, y(objective.z) - 2, 4, 4);
    }
    for (const leader of game.leaders.filter((l) => l.spec.area === game.area)) {
      ctx.fillStyle = leader.suspicion > 50 ? '#ef8e7d' : '#d2a673'; ctx.beginPath(); ctx.arc(x(leader.position.x), y(leader.position.z), 3.1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ad906355'; ctx.beginPath(); ctx.moveTo(x(leader.position.x), y(leader.position.z)); ctx.lineTo(x(leader.position.x + Math.sin(leader.rig.root.rotation.y) * 3), y(leader.position.z + Math.cos(leader.rig.root.rotation.y) * 3)); ctx.stroke();
    }
    const px = x(game.player.position.x), py = y(game.player.position.z);
    ctx.fillStyle = '#e9e6d7'; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e9e6d766'; ctx.beginPath(); ctx.arc(px, py, 7.2, 0, Math.PI * 2); ctx.stroke();
  }
}

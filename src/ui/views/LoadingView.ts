import { icon } from '../icons';

/** Loading/error states use the same type, color and action hierarchy as the game UI. */
export function loadingView(): string {
  return `<section class="loading" aria-label="正在载入游戏"><div class="loading-frame"><span class="eyebrow">AFTER HOURS / 27F</span><div class="loading-mark" aria-hidden="true">${icon('lift')}</div><h1>准点下班<span>。</span></h1><p role="status" aria-live="polite">正在点亮办公室…</p><span class="loading-note">今天的工作，到此为止。</span></div></section>`;
}
export function loadingErrorView(): string {
  return `<section class="loading is-error"><div class="loading-frame"><span class="eyebrow">AFTER HOURS / CONNECTION LOST</span><div class="loading-mark" aria-hidden="true">${icon('lift')}</div><h1>办公室暂时未能打开</h1><p role="alert">游戏资源未能完整载入。请检查连接后重新加载。</p><p class="loading-note">若仍无法进入，请使用支持 WebGL 的浏览器，并在浏览器设置中启用硬件加速。</p><button id="reload" class="button primary"><span>重新加载</span>${icon('arrow')}</button></div></section>`;
}

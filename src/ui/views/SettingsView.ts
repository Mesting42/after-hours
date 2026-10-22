import type { Action, Settings } from '../../game/types';
import { escapeHTML, icon } from '../icons';
import { button } from './controls';

export const SETTINGS_SECTIONS = ['graphics', 'controls', 'touch', 'audio', 'accessibility'] as const;
export type SettingsSection = typeof SETTINGS_SECTIONS[number];
const sections: Record<SettingsSection, [string, string, string]> = {
  graphics: ['画面', 'GRAPHICS', 'eye'], controls: ['操作', 'CONTROLS', 'settings'],
  touch: ['触屏', 'TOUCH', 'hand'], audio: ['声音', 'AUDIO', 'sound'], accessibility: ['辅助', 'ACCESSIBILITY', 'shield'],
};

/** Pure markup: validated settings stay owned by SettingsManager. */
export function settingsView(s: Settings, selected: SettingsSection): string {
  const toggle = (key: keyof Settings, label: string, note = '') => `<label class="setting-toggle"><span>${label}${note ? `<small id="setting-note-${key}">${note}</small>` : ''}</span><input type="checkbox" aria-label="${label}" ${note ? `aria-describedby="setting-note-${key}"` : ''} data-setting="${key}" ${s[key] ? 'checked' : ''}></label>`;
  const range = (key: keyof Settings, label: string, min: number, max: number, step: number) => `<label class="setting-range"><span>${label}<output data-output="${key}">${s[key]}</output></span><input type="range" aria-label="${label}" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"></label>`;
  const heading = (title: string, note: string) => `<header class="settings-section-heading"><h3>${title}</h3><p>${note}</p></header>`;
  const keyLabels: Partial<Record<Action, string>> = { up: '前进', down: '后退', left: '向左', right: '向右', run: '快走', crouch: '蹲伏', interact: '互动', noise: '干扰', hide: '隐藏' };
  const contents: Record<SettingsSection, string> = {
    graphics: `${heading('画面与性能', '先让操作流畅，再选择适合你的画面。')}
      <label class="setting-select">画质预设<select id="quality" aria-label="画质预设">${(['low','medium','high'] as const).map((quality, i) => `<option value="${quality}" ${s.quality === quality ? 'selected' : ''}>${['低 · 节能','中 · 均衡','高 · 清晰'][i]}</option>`).join('')}</select></label>
      <div class="setting-feature">${toggle('autoQuality','自动调节画质，优先流畅','持续掉帧时适度降低画质，保留你的手动选项。')}</div>
      <div class="setting-grid">${toggle('shadows','角色与家具阴影')}${toggle('antialias','抗锯齿')}${toggle('dynamicLights','动态局部灯光')}${toggle('particles','环境粒子与标记')}${toggle('postProcessing','后处理与暗角')}${toggle('showFPS','显示帧率')}${range('lightCount','局部灯光数量',1,6,1)}${range('renderScale','渲染比例',.5,1.5,.1)}${range('textureQuality','贴图采样质量',.5,2,.5)}</div>`,
    controls: `${heading('镜头与输入', '找到舒服的视角，让每一步都在掌握之中。')}<div class="setting-grid">${range('sensitivity','镜头灵敏度',.2,2.5,.1)}${range('cameraDistance','镜头距离',15,34,1)}${range('fov','视野角度',40,80,1)}${toggle('invertCamera','反转镜头拖动')}${toggle('gamepad','启用手柄')}</div><h4 class="setting-subtitle">键位重绑</h4><p class="setting-help">点击按键后按下新键；Esc 取消，暂停始终使用 Esc。</p><div class="keybindings">${Object.entries(keyLabels).map(([action,label]) => `<label>${label}<button class="keybinding" data-rebind="${action}" aria-label="重绑${label}按键">${escapeHTML(s.bindings[action as Action].replace('Key',''))}</button></label>`).join('')}</div>`,
    touch: `${heading('触屏操作', '左手移动，右手行动。拖动场景右侧调整镜头。')}<div class="touch-diagram" aria-hidden="true"><span class="touch-diagram-stick">移动</span><span>＋</span><span class="touch-diagram-action">互动</span></div><div class="setting-grid">${range('joystickSize','摇杆直径',90,160,5)}${range('buttonOpacity','按钮透明度',.3,1,.05)}</div><p class="setting-help">快走需按住；蹲伏、隐藏、互动和声音干扰点击一次即可。</p>`,
    audio: `${heading('办公室的声音', '留意脚步、打印声，以及电梯抵达的那一声。')}<div class="setting-grid">${range('masterVolume','主音量',0,1,.05)}${range('musicVolume','办公室环境声',0,1,.05)}${range('effectsVolume','音效音量',0,1,.05)}</div>`,
    accessibility: `${heading('按你的节奏', '提示、对比度与动态效果，都可以调整。')}<div class="setting-grid">${toggle('reducedMotion','减少非必要动态','保留静态目标指引和操作反馈。')}${toggle('highContrast','高对比度界面')}${toggle('hints','显示任务提示')}${toggle('visibleCones','显示领导视野')}</div>`,
  };
  return `<div class="settings-layout"><nav class="settings-tabs" role="tablist" aria-label="设置分类">${SETTINGS_SECTIONS.map((key) => `<button id="tab-${key}" type="button" role="tab" data-settings-tab="${key}" aria-controls="settings-${key}" aria-selected="${key === selected}" tabindex="${key === selected ? 0 : -1}">${icon(sections[key][2])}<span>${sections[key][0]}<small>${sections[key][1]}</small></span></button>`).join('')}</nav><div class="settings-content">${SETTINGS_SECTIONS.map((key) => `<section role="tabpanel" id="settings-${key}" aria-labelledby="tab-${key}" ${key === selected ? '' : 'hidden'}>${contents[key]}</section>`).join('')}</div></div><div class="settings-footer"><span>设置自动保存</span>${button('settings-reset','恢复默认','quiet','settings')}${button('settings-back','完成','primary')}</div>`;
}

/** WAI-ARIA tab behavior, shared by mouse, touch and keyboard. No game state lives here. */
export function bindSettingsTabs(root: HTMLElement, selected: SettingsSection, onSelect: (section: SettingsSection) => void): () => void {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')];
  const lifecycle = new AbortController(), tablist = root.querySelector('[role=tablist]')!;
  const orient = () => tablist.setAttribute('aria-orientation', matchMedia('(max-width:700px)').matches ? 'horizontal' : 'vertical');
  orient(); window.addEventListener('resize', orient, { signal: lifecycle.signal });
  const activate = (section: SettingsSection, focus = false) => {
    tabs.forEach((tab) => {
      const active = tab.dataset.settingsTab === section;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      root.querySelector<HTMLElement>(`#${tab.getAttribute('aria-controls')}`)!.hidden = !active;
      if (active && focus) tab.focus();
    });
    onSelect(section);
  };
  tabs.forEach((tab,index) => {
    tab.addEventListener('click', () => activate(tab.dataset.settingsTab as SettingsSection));
    tab.addEventListener('keydown', (event) => {
      let next = index;
      if (['ArrowDown','ArrowRight'].includes(event.key)) next = (index + 1) % tabs.length;
      else if (['ArrowUp','ArrowLeft'].includes(event.key)) next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); activate(tabs[next].dataset.settingsTab as SettingsSection, true);
    });
  });
  activate(selected);
  return () => lifecycle.abort();
}

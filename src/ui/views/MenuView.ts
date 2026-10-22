import { icon } from '../icons';

/** Static menu view. Save state and actions are supplied by GameUI, never by this template. */
export function menuView(): string {
  return `<main id="menu" class="menu">
    <header class="menu-header">
      <a class="brand" href="#" aria-label="准点下班主菜单">${icon('lift')}<span>AFTER HOURS<small>一场关于回家的潜行</small></span></a>
      <span class="building">NORTH WING <b>27F</b></span>
    </header>
    <div class="menu-stage">
      <div class="menu-copy">
        <p class="eyebrow"><span class="status-dot"></span> 17:55 / THE LAST FIVE MINUTES</p>
        <h1>准点下班<span class="title-period">。</span></h1>
        <p class="title-english" aria-hidden="true">AFTER HOURS</p>
        <p class="tagline">今天的工作，到此为止。</p>
        <p class="menu-description">办公室还在看着你。<br>避开领导的视线，找到回家的电梯。</p>
        <div class="menu-navigation">
          <div class="menu-actions" aria-label="开始或继续旅程">
            <button id="new-game" class="menu-action is-primary"><span class="action-index" aria-hidden="true">01</span><span class="action-copy"><strong>开始下班</strong><small>从第一章开始一段新旅程</small></span>${icon('arrow')}</button>
            <button id="continue-game" class="menu-action" disabled><span class="action-index" aria-hidden="true">02</span><span class="action-copy"><strong>继续上次旅程</strong><small id="continue-description">还没有可继续的旅程</small></span>${icon('arrow')}</button>
          </div>
          <nav class="menu-links" aria-label="游戏选项"><button id="level-select"><span aria-hidden="true">03</span>章节选择${icon('arrow')}</button><button id="menu-settings"><span aria-hidden="true">04</span>设置${icon('settings')}</button><button id="how-to"><span aria-hidden="true">05</span>操作说明${icon('hand')}</button></nav>
        </div>
        <fieldset class="difficulty"><legend>新旅程难度</legend><button class="difficulty-option selected" data-difficulty="normal" aria-pressed="true">普通<span>留一点余地</span></button><button class="difficulty-option" data-difficulty="hard" aria-pressed="false">硬核<span>每一步都算数</span></button></fieldset>
        <p id="difficulty-note" class="difficulty-note">清晰引导 · 宽容警戒 · 区域检查点</p>
      </div>
      <aside class="departure-note" aria-label="旅程进度">
        <span class="departure-time" aria-hidden="true">27<span>F</span></span>
        <div class="departure-rule"></div><span class="small-label" id="departure-label">这层楼，离家不远</span>
        <strong id="departure-title">五个区域，一趟归途。</strong><p id="departure-detail">关掉电脑。带上工牌。安静地离开。</p>
        <div class="departure-route" aria-hidden="true"><span>01</span><i></i><span>02</span><i></i><span>03</span><i></i><span>04</span><i></i><span>05</span>${icon('lift')}</div>
      </aside>
    </div>
    <footer class="menu-footer"><span>不必打败谁。只需要准时回家。</span><div><button id="sources">素材来源</button><span>v1.0.0</span></div></footer>
  </main>`;
}

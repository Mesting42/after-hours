import './styles/tokens.css';
import './styles/game.css';
import './styles/menu.css';
import './styles/hud.css';
import './styles/settings.css';
import './styles/tutorial.css';
import { Game } from './game/Game';
import { GameUI } from './ui/GameUI';
import type { OfficeLayout, GameplayTiming } from './game/data/gameConfig';
import { AREAS } from './game/data/levels';
import { loadingView, loadingErrorView } from './ui/views/LoadingView';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = loadingView();
try {
  const load = async <T>(name: string): Promise<T> => {
    const response = await fetch(`${import.meta.env.BASE_URL}assets/${name}`);
    if (!response.ok) throw new Error(`本地资源加载失败：${name}`);
    return response.json() as Promise<T>;
  };
  const [layout, timing] = await Promise.all([load<OfficeLayout>('config/office-layout.json'), load<GameplayTiming>('config/gameplay-timing.json')]);
  const game = await Game.create(document.querySelector<HTMLCanvasElement>('#game-canvas')!, layout, timing, (label) => {
    const message = app.querySelector('p'); if (message) message.textContent = label;
  });
  const ui = new GameUI(app, game);
  game.run();
  // Integration fixture access is excluded from production. QA may position entities to test states.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('qa')) {
    const { installHarness } = await import('./qa/DevHarness');
    installHarness(game, ui);
    const bridge = {
      game,
      snapshot: () => ({ phase: game.phase, area: game.area, position: game.player.position, state: game.player.state,
        inventory: [...game.inventory], suspicion: game.suspicion, difficulty: game.save.difficulty,
        nearby: game.closestInteractive()?.id, completed: game.save.completed, fps: game.performance.fps,
        clock: game.clock.label, webGL: game.engine.webGLVersion,
        leaders: game.leaders.filter((l) => l.spec.area === game.area).map((l) => ({ id: l.spec.id, position: l.position, state: l.state, suspicion: l.suspicion })) }),
      area: (id: number) => { game.player.teleport(AREAS[id].checkpoint); },
    };
    (window as unknown as { __QA__: typeof bridge }).__QA__ = bridge;
  }
} catch (error) {
  console.error(error);
  app.innerHTML = loadingErrorView();
  document.getElementById('reload')?.addEventListener('click', () => location.reload());
}

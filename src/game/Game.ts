import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
// Register local shaders eagerly: a first-frame race must not fall back to fetching .fx URLs.
import '@babylonjs/core/Shaders/shadowMap.vertex';
import '@babylonjs/core/Shaders/shadowMap.fragment';
import '@babylonjs/core/Shaders/default.vertex';
import '@babylonjs/core/Shaders/default.fragment';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AREAS, INTERACTABLES, LEADERS, flagLabel } from './data/levels';
import { OfficeWorld } from './scenes/OfficeWorld';
import type { OfficeLayout, GameplayTiming } from './data/gameConfig';
import { ModelLibrary } from './assets/ModelLibrary';
import { PlayerController } from './entities/PlayerController';
import { LeaderController } from './entities/LeaderController';
import { NavigationSystem } from './systems/NavigationSystem';
import { VisionSystem } from './systems/VisionSystem';
import { NoiseSystem } from './systems/NoiseSystem';
import { InputManager } from './systems/InputManager';
import { GameClock } from './systems/GameClock';
import { SaveManager, freshSave } from './systems/SaveManager';
import { SettingsManager } from './systems/SettingsManager';
import { CheckpointManager } from './systems/CheckpointManager';
import { AudioManager } from './systems/AudioManager';
import { PerformanceManager } from './systems/PerformanceManager';
import { AtmosphereSystem } from './systems/AtmosphereSystem';
import { CameraFollowSystem } from './systems/CameraFollowSystem';
import { TutorialSystem, firstChapterStep } from './systems/TutorialSystem';
import { TutorialGuide } from './scenes/TutorialGuide';
import { clamp, distance, type Difficulty, type GamePhase, type Interactable, type SaveData, type Settings } from './types';

export interface GameEvents {
  phase: (phase: GamePhase) => void;
  toast: (message: string) => void;
  region: (area: number) => void;
  keypad: (callback: (code: string) => void) => void;
}
/** Composition root. Systems own behavior; the game only sequences updates and progression. */
export class Game {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private readonly cameraFollow: CameraFollowSystem;
  readonly world: OfficeWorld;
  readonly navigation: NavigationSystem;
  readonly input: InputManager;
  readonly player: PlayerController;
  readonly leaders: LeaderController[];
  readonly clock = new GameClock();
  // Development fixtures have separate storage, preserving the user's real run.
  readonly saves = new SaveManager(import.meta.env.DEV && new URLSearchParams(location.search).has('qa') ? 'after-hours.qa.save.v1' : undefined);
  readonly checkpoint = new CheckpointManager();
  readonly settings = new SettingsManager(import.meta.env.DEV && new URLSearchParams(location.search).has('qa') ? 'after-hours.qa.settings.v1' : undefined);
  readonly audio: AudioManager;
  readonly performance: PerformanceManager;
  readonly noise: NoiseSystem;
  readonly vision: VisionSystem;
  readonly atmosphere: AtmosphereSystem;
  readonly tutorial = new TutorialSystem();
  readonly guide: TutorialGuide;
  phase: GamePhase = 'menu';
  save: SaveData;
  inventory = new Set<string>();
  area = 0;
  nearby: Interactable | null = null;
  interaction: { object: Interactable; progress: number } | null = null;
  elevatorWait = 0;
  printerWait = 0;
  suspicion = 0;
  cameraAlarm = 0;
  failReason = '';
  escapeTimer = 0;
  private failTimer = -1;
  private footstepTimer = 0;
  private autosaveTimer = 0;
  private hudTimer = 0;
  private escalated = false;
  private alertCooldown = 0;
  private elevatorOpen = 0;
  private liftOpening = false;
  private onFrame: (() => void) | null = null;
  private lastTimestamp = 0;
  private lastRender = 0;
  private events: GameEvents = { phase: () => {}, toast: () => {}, region: () => {}, keypad: () => {} };
  /** All required local art loads before gameplay is exposed to the user. */
  static async create(canvas: HTMLCanvasElement, layout: OfficeLayout, timing: GameplayTiming, progress: (label: string) => void): Promise<Game> {
    // FXAA is owned by PerformanceManager; a second MSAA buffer and retaining the
    // previous drawing buffer add bandwidth on integrated GPUs without gameplay value.
    const engine = new Engine(canvas, false, { stencil: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', disableWebGL2Support: false });
    const scene = new Scene(engine);
    try {
      const models = await ModelLibrary.load(scene, progress);
      return new Game(canvas, layout, timing, engine, scene, models);
    } catch (error) { scene.dispose(); engine.dispose(); throw error; }
  }
  private constructor(public canvas: HTMLCanvasElement, layout: OfficeLayout, private timing: GameplayTiming, engine: Engine, scene: Scene, models: ModelLibrary) {
    this.engine = engine; this.scene = scene; this.scene.clearColor = new Color4(0.06, 0.1, 0.12, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2; this.scene.fogDensity = 0.006; this.scene.fogColor = new Color3(0.13, 0.2, 0.23);
    this.camera = new ArcRotateCamera('isometric', -1.12, 0.89, 38, new Vector3(0, 0.8, 22), this.scene);
    this.camera.minZ = 0.15; this.camera.maxZ = 170; this.camera.fov = 55 * Math.PI / 180;
    // Input is handled by one Pointer Events owner; Babylon's default camera controls stay detached.
    this.camera.inputs.clear();
    this.cameraFollow = new CameraFollowSystem(this.camera);
    const ambient = new HemisphericLight('cool-ambient', new Vector3(0, 1, 0), this.scene); ambient.intensity = 0.68; ambient.diffuse = new Color3(0.76, 0.86, 0.9); ambient.groundColor = new Color3(0.22, 0.28, 0.32);
    const sun = new DirectionalLight('late-window-light', new Vector3(-0.7, -1, 0.4), this.scene); sun.position.set(12, 30, 10); sun.intensity = 1.12; sun.diffuse = new Color3(0.68, 0.81, 0.87);
    const shadow = new ShadowGenerator(1024, sun); shadow.usePoissonSampling = true; shadow.transparencyShadow = false;
    this.world = new OfficeWorld(this.scene, layout, models); this.navigation = new NavigationSystem(this.world.blockers); this.vision = new VisionSystem(this.scene); this.noise = new NoiseSystem(this.navigation);
    this.input = new InputManager(canvas, this.settings.value); this.player = new PlayerController(this.scene, this.navigation, models);
    this.guide = new TutorialGuide(this.scene, this.navigation);
    this.player.rig.meshes.forEach((mesh) => shadow.addShadowCaster(mesh));
    this.leaders = LEADERS.map((spec) => new LeaderController(this.scene, spec, this.navigation, this.vision, this.noise, models));
    this.leaders.forEach((leader) => leader.rig.meshes.forEach((mesh) => shadow.addShadowCaster(mesh)));
    // Furnishing casters are limited to meaningful tall pieces, rather than every keyboard/mug.
    this.scene.meshes.filter((mesh) => mesh.metadata?.occluder && mesh.name.startsWith('furniture-')).forEach((mesh) => shadow.addShadowCaster(mesh));
    this.performance = new PerformanceManager(this.engine, this.scene, this.camera, shadow, (profile) => {
      this.world.setArea(this.phase === 'menu' ? 0 : this.area, profile.lightCount, profile.dynamicLights);
    });
    this.atmosphere = new AtmosphereSystem(this.scene);
    this.audio = new AudioManager(this.settings.value); this.save = this.saves.load() ?? freshSave();
    this.player.teleport(AREAS[0].checkpoint); this.world.setArea(0, this.settings.value.lightCount, this.settings.value.dynamicLights);
    this.leaders.forEach((leader) => leader.setEnabled(leader.spec.area === 0));
    this.performance.setArea(0);
    this.applySettings(this.settings.value);
    window.addEventListener('resize', () => this.performance.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.phase === 'playing') this.pause(); });
    this.engine.onContextLostObservable.add(() => { if (this.phase === 'playing') this.pause(); this.events.toast('图形上下文暂时丢失，等待浏览器恢复后继续。'); });
  }
  connect(events: GameEvents, onFrame: () => void): void { this.events = events; this.onFrame = onFrame; }
  run(): void {
    this.engine.runRenderLoop(() => {
      const now = performance.now(), frameMs = this.lastTimestamp ? now - this.lastTimestamp : 16;
      const dt = clamp(frameMs / 1000, 0, .05); this.lastTimestamp = now;
      if (document.hidden) return;
      // Menus/paused screens need only 15 visual updates per second, saving GPU time.
      if (!['playing', 'escaping'].includes(this.phase) && now - this.lastRender < 66) return;
      this.lastRender = now;
      this.step(dt); this.scene.render(); this.performance.update(frameMs, this.phase === 'playing' || this.phase === 'escaping');
      this.hudTimer += dt; if (this.hudTimer > 0.09) { this.onFrame?.(); this.hudTimer = 0; }
    });
  }
  private setPhase(phase: GamePhase): void { this.phase = phase; if (phase !== 'playing') this.guide.hide(); this.input.enabled = phase === 'playing'; this.input.clear(); this.performance.setArea(phase === 'menu' ? 0 : this.area); this.events.phase(phase); }
  start(difficulty: Difficulty, area = 0, continuing = false): void {
    this.world.playerOcclusion.reset();
    const previous = this.saves.load();
    this.save = continuing && previous ? previous : freshSave(difficulty);
    this.save.unlocks = Math.max(this.save.unlocks, previous?.unlocks ?? 0);
    if (!continuing && area > 0) {
      for (const object of INTERACTABLES.filter((o) => o.area < area && o.reward)) { this.save.inventory.push(object.reward!); this.save.completed.push(object.id); }
      this.checkpoint.enter(area, this.save); this.save.clockSeconds = 300 + area * 420;
    }
    this.inventory = new Set(this.save.inventory); this.area = this.save.area;
    this.printerWait = this.inventory.has('print-queued') && !this.inventory.has('print-ready') ? 24 : 0;
    this.clock.seconds = this.save.clockSeconds; this.clock.elapsed = this.save.elapsed;
    this.player.crouched = false; this.player.teleport(this.save.checkpoint);
    this.tutorial.reset(); this.guide.hide();
    this.camera.alpha = -1.12; this.camera.beta = 0.89; this.camera.radius = this.settings.value.cameraDistance; this.cameraFollow.snapTo(this.player.cameraTarget);
    this.leaders.forEach((leader) => { leader.reset(); leader.setEnabled(leader.spec.area === this.area); });
    for (const flag of this.world.doors.keys()) this.world.setDoor(flag, this.inventory.has(flag), true);
    this.world.setArea(this.area, this.performance.profile.lightCount, this.performance.profile.dynamicLights);
    this.suspicion = 0; this.cameraAlarm = 0; this.noise.events = []; this.interaction = null; this.failTimer = -1; this.failReason = ''; this.escapeTimer = 0; this.elevatorWait = 0; this.elevatorOpen = 0; this.liftOpening = this.inventory.has('lift-ready');
    if (this.inventory.has('lift-call') && !this.liftOpening) this.elevatorWait = 12;
    this.world.setElevator(0); this.escalated = this.clock.afterHours; this.setPhase('playing'); this.audio.unlock(); this.persist(); this.events.region(this.area);
    this.canvas.focus({ preventScroll: true });
    if (this.area !== 0 && !this.save.tutorial.includes('movement')) { this.events.toast('WASD / 方向键移动，C 蹲伏，E 互动。触屏使用左侧摇杆。'); this.save.tutorial.push('movement'); }
    if (!this.saves.storageAvailable) this.events.toast('浏览器暂时无法写入本地存档。当前会话可以重试和继续，关闭或刷新后可能丢失进度。');
  }
  pause(): void { if (this.phase !== 'playing') return; this.persist(); this.setPhase('paused'); this.audio.pause(); }
  resume(): void { if (this.phase !== 'paused') return; this.setPhase('playing'); this.audio.resume(); this.canvas.focus({ preventScroll: true }); }
  menu(): void {
    this.world.playerOcclusion.reset();
    if (this.phase === 'playing' || this.phase === 'paused') this.persist();
    this.setPhase('menu'); this.audio.pause();
    // The menu always returns to its architectural opening shot; the saved region stays intact.
    this.player.teleport(AREAS[0].checkpoint); this.camera.target.set(0, 0.8, 22);
    this.camera.alpha = -1.12; this.camera.beta = 0.89; this.camera.radius = 38;
    this.world.setArea(0, this.performance.profile.lightCount, this.performance.profile.dynamicLights);
    this.leaders.forEach((leader) => leader.setEnabled(leader.spec.area === 0));
    if (!this.saves.storageAvailable) this.events.toast('当前会话仍可继续；浏览器未能持久保存进度，请暂时不要关闭或刷新。');
  }
  retry(): void { this.start(this.save.difficulty, this.area, true); }
  private persist(): void { this.save.inventory = [...this.inventory]; this.save.clockSeconds = this.clock.seconds; this.save.elapsed = this.clock.elapsed; this.saves.write(this.save); }
  applySettings(settings: Settings): void {
    this.input.settings = settings; this.performance.apply(settings); this.audio.update(settings);
    this.camera.fov = settings.fov * Math.PI / 180;
    if (this.phase !== 'menu') this.camera.radius = settings.cameraDistance;
  }
  /** One fixed simulation step, reusable by development-only integration fixtures. */
  step(dt: number): void {
    const s = this.settings.value;
    const particles = this.performance.profile.particles;
    this.atmosphere.update(this.player.position, particles && !s.reducedMotion && ['menu', 'playing', 'escaping'].includes(this.phase));
    if (this.input.consume('pause')) { if (this.phase === 'playing') this.pause(); else if (this.phase === 'paused') this.resume(); }
    if (this.phase === 'menu') {
      this.player.rig.animate(dt, 0, 'Normal');
      // A quiet architectural shot. No endless camera motion in reduced-motion mode.
      if (!s.reducedMotion) this.camera.alpha = -1.12 + Math.sin(performance.now() * 0.000045) * 0.025;
      this.world.update(dt, this.inventory, particles, s.reducedMotion); return;
    }
    if (this.phase === 'escaping') {
      this.escapeTimer += dt;
      this.player.rig.root.position.z += (316.6 - this.player.position.z) * dt * 2;
      this.player.rig.root.position.x += (0 - this.player.position.x) * dt * 2;
      this.player.rig.root.rotation.y = 0; this.player.rig.animate(dt, this.escapeTimer < 1.3 ? 2 : 0, 'Escaping');
      this.elevatorOpen = Math.max(0, 1 - Math.max(0, this.escapeTimer - 1.5) / this.timing.elevatorCloseSeconds); this.world.setElevator(this.elevatorOpen);
      if (this.escapeTimer > 4.2) { this.save.ending = this.save.difficulty === 'hard' ? 'silent-professional' : 'home-at-last'; this.save.unlocks = 4; this.persist(); this.audio.play('lift-bell'); this.setPhase('victory'); }
      return;
    }
    if (this.phase !== 'playing') return;
    if (this.failTimer >= 0) { this.guide.hide(); this.failTimer -= dt; this.player.rig.animate(dt, 0, 'Discovered'); if (this.failTimer <= 0) { this.failTimer = -1; this.setPhase('failed'); this.audio.pause(); } return; }
    this.clock.update(dt); this.autosaveTimer += dt; this.alertCooldown -= dt;
    if (this.clock.afterHours && !this.escalated) { this.escalated = true; this.events.toast('18:00。领导开始加密巡逻。时间不会直接导致失败。'); }
    const camera = this.input.consumeCamera();
    this.camera.alpha -= camera.x * 0.004 * s.sensitivity * (s.invertCamera ? -1 : 1);
    this.camera.beta = clamp(this.camera.beta + camera.y * 0.003 * s.sensitivity * (s.invertCamera ? -1 : 1), 0.48, 1.14);
    this.camera.radius = clamp(this.camera.radius + camera.zoom, 15, 34);
    if (this.input.consume('crouch')) { if (this.player.state !== 'Hiding') this.player.crouched = !this.player.crouched; }
    if (this.input.consume('interact')) { if (this.interaction) this.cancelInteraction(); else this.interact(); }
    if (this.input.consume('hide')) {
      const spot = INTERACTABLES.find((o) => o.area === this.area && o.kind === 'hide' && distance(this.player.position, o) < 2.2);
      if (this.player.state === 'Hiding') this.leaveHide(); else if (spot) this.beginInteraction(spot); else this.events.toast('靠近蓝色标记的储物间或文件柜后再隐藏。');
    }
    if (this.input.consume('noise')) this.distract();
    if (this.interaction && Math.hypot(...Object.values(this.input.movement())) > 0.2) this.cancelInteraction();
    const beforeMovement = this.player.position;
    this.player.update(dt, this.input, this.camera.alpha);
    if (this.tutorial.recordMovement(this.save, distance(beforeMovement, this.player.position))) this.persist();
    this.cameraFollow.update(this.player.cameraTarget, dt, s.reducedMotion);
    const area = clamp(Math.floor(this.player.position.z / 64), 0, 4);
    if (area !== this.area) this.enterArea(area);
    // Synchronize the actual orbit after input/follow before testing its sight lines.
    this.camera.getViewMatrix(true);
    this.world.fadeNearCamera(this.camera.position, this.player.position, this.player.crouched, dt, s.reducedMotion);
    this.nearby = this.closestInteractive();
    if (this.interaction) this.updateInteraction(dt);
    if (this.player.speed > 0.2) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) { this.audio.play('footstep', this.player.state === 'Crouching' ? 0.2 : this.player.state === 'Running' ? 0.9 : 0.45); if (this.player.state !== 'Crouching') this.noise.emit(this.player.position, this.player.state === 'Running' ? 11 : 3); this.footstepTimer = this.player.state === 'Running' ? 0.3 : this.player.state === 'Crouching' ? 0.75 : 0.5; }
    }
    this.noise.update(dt); this.updateAI(dt);
    if (this.printerWait > 0) {
      this.printerWait -= dt;
      if (this.printerWait <= 0) { this.inventory.add('print-ready'); this.events.toast('安保路线打印完毕。回到打印机取走文件。'); this.persist(); }
    }
    if (this.elevatorWait > 0) { this.elevatorWait -= dt; if (this.elevatorWait <= 0) { this.inventory.add('lift-ready'); this.liftOpening = true; this.audio.play('lift-bell'); this.events.toast('电梯已到达。避开安保主管，进入暖光中的电梯。'); this.persist(); } }
    if (this.liftOpening) { this.elevatorOpen = Math.min(1, this.elevatorOpen + dt * 0.55); this.world.setElevator(this.elevatorOpen); }
    this.world.update(dt, this.inventory, particles, s.reducedMotion);
    this.guide.update(s.hints && this.player.state !== 'Discovered' ? firstChapterStep(this.save, this.interaction?.object.id) : null, this.player.position, dt, s.reducedMotion);
    if (this.autosaveTimer > 8) { this.persist(); this.autosaveTimer = 0; }
  }
  private enterArea(area: number): void {
    this.area = area; this.checkpoint.enter(area, this.save); this.persist();
    this.leaders.forEach((leader) => { leader.setEnabled(leader.spec.area === area); if (leader.spec.area === area) leader.reset(); });
    this.cameraAlarm = 0; this.suspicion = 0;
    this.world.setArea(area, this.performance.profile.lightCount, this.performance.profile.dynamicLights); this.performance.setArea(area); this.events.region(area);
    this.events.toast(this.saves.storageAvailable ? '检查点已保存。' : '检查点已记录在当前会话，浏览器暂时无法持久保存。');
  }
  private updateAI(dt: number): void {
    const active = this.leaders.filter((leader) => leader.spec.area === this.area);
    const illumination = Math.abs(this.player.position.x) > 12 ? 0.65 : 1;
    for (const leader of active) leader.update(dt, this.player, this.save.difficulty, this.clock.afterHours, this.settings.value.visibleCones, illumination);
    const alarmed = active.find((leader) => leader.suspicion > 72);
    if (alarmed && this.alertCooldown <= 0) { active.filter((leader) => leader !== alarmed).forEach((leader) => leader.alert(alarmed.lastKnown)); this.alertCooldown = 8; this.events.toast('领导已向附近同事示警。尽快脱离视线。'); }
    let cameraSees = false;
    for (const sensor of this.world.securityCameras.filter((c) => c.area === this.area)) {
      const live = (Math.floor(this.clock.elapsed / 7) + Math.floor(sensor.position.z)) % 3 !== 0;
      sensor.mesh.visibility = live ? 1 : 0.4;
      sensor.indicator.diffuseColor = Color3.FromHexString(live ? '#dc7566' : '#88b797');
      sensor.indicator.emissiveColor = sensor.indicator.diffuseColor.scale(0.9);
      if (live && this.player.state !== 'Hiding' && this.vision.visibility(sensor.position, sensor.heading, this.player.position, 14, 1.1, this.player.crouched) > 0) cameraSees = true;
    }
    this.cameraAlarm = clamp(this.cameraAlarm + (cameraSees ? this.save.difficulty === 'hard' ? 24 : 14 : -14) * dt, 0, 100);
    if (this.cameraAlarm > 45 && this.alertCooldown <= 0) { active.forEach((l) => l.alert(this.player.position)); this.alertCooldown = 8; this.events.toast('监控记录到了移动，安保正在调查。'); }
    this.suspicion = Math.max(this.cameraAlarm, ...active.map((leader) => leader.suspicion));
    const discovering = active.find((leader) => leader.suspicion >= 100);
    if (discovering || this.cameraAlarm >= 100) {
      this.failReason = discovering ? `${discovering.spec.name}确认发现了你。` : '安保通过监控确认了你的位置。';
      this.player.state = 'Discovered'; this.input.enabled = false; this.failTimer = 0.55; this.audio.play('alert'); this.persist();
    }
  }
  closestInteractive(): Interactable | null {
    if (this.player.state === 'Hiding') return INTERACTABLES.find((o) => o.id === this.player.hiddenAt) ?? null;
    let closest: Interactable | null = null, nearest = 2.3;
    for (const obj of INTERACTABLES) {
      if (obj.area !== this.area || this.save.completed.includes(obj.id)) continue;
      const length = distance(this.player.position, obj);
      if (length < nearest) { closest = obj; nearest = length; }
    }
    return closest;
  }
  interact(): void { if (this.player.state === 'Hiding') { this.leaveHide(); return; } const obj = this.closestInteractive(); if (obj) this.beginInteraction(obj); else this.events.toast('靠近金色或蓝色地面标记，再按互动。'); }
  private beginInteraction(obj: Interactable): void {
    const missing = obj.requires.filter((requirement) => !this.inventory.has(requirement));
    if (missing.length) { this.events.toast(`还需要：${missing.map(flagLabel).join('、')}。`); return; }
    if (obj.kind === 'hide') {
      if (this.suspicion > 74) { this.events.toast('领导正盯着你，先绕过实墙脱离视线再隐藏。'); return; }
      this.player.state = 'Hiding'; this.player.hiddenAt = obj.id; this.player.disguised = false; this.player.rig.setEnabled(false); this.events.toast('已隐藏。移动、互动或隐藏按钮可离开。'); return;
    }
    if (obj.kind === 'disguise') { this.player.disguised = !this.player.disguised; this.events.toast(this.player.disguised ? '工作伪装中。移动会停止伪装；安保主管仍可能察觉。' : '已停止工作伪装。'); return; }
    if (obj.kind === 'printer') {
      if (!this.inventory.has('print-queued')) {
        this.inventory.add('print-queued'); this.printerWait = 24; this.noise.emit(obj, 22, true); this.audio.play('printer');
        this.events.toast('打印已启动，24 秒后回来取件。噪声会吸引领导，先离开这里。'); this.persist(); return;
      }
      if (!this.inventory.has('print-ready')) { this.events.toast(`打印中，还需约 ${Math.ceil(this.printerWait)} 秒。先离开领导的调查路线。`); return; }
    }
    if (obj.id === 'authorization') {
      this.pause(); this.events.keypad((code) => { if (code !== '1800') { this.events.toast('口令错误。查看人事便签上的四位数字。'); return; } this.resume(); this.interaction = { object: obj, progress: 0 }; this.player.state = 'Interacting'; }); return;
    }
    this.interaction = { object: obj, progress: 0 }; this.player.state = 'Interacting';
    if (obj.kind === 'panel') this.noise.emit(obj, 5);
  }
  private updateInteraction(dt: number): void {
    if (!this.interaction) return;
    const { object } = this.interaction;
    this.interaction.progress += dt;
    if (this.interaction.progress < object.duration) return;
    this.interaction = null; this.player.state = this.player.crouched ? 'Crouching' : 'Normal';
    if (object.kind === 'elevator') {
      if (this.elevatorOpen < 0.94) { this.events.toast('电梯门正在打开，请稍等。'); return; }
      // The cinematic needs opaque doors even if camera occlusion previously faded them.
      this.world.playerOcclusion.reset();
      this.player.state = 'Escaping'; this.escapeTimer = 0; this.setPhase('escaping'); this.audio.play('lift-bell'); return;
    }
    if (object.reward) this.inventory.add(object.reward);
    this.save.completed.push(object.id); this.world.setDoor(object.reward ?? '', true); this.audio.play('interact');
    if (object.id === 'lift-call') this.elevatorWait = 12;
    this.events.toast(object.kind === 'note' ? object.description : `${object.label}完成。`); this.persist();
  }
  private cancelInteraction(): void { this.interaction = null; this.player.state = this.player.crouched ? 'Crouching' : 'Normal'; this.events.toast('互动已中断。'); }
  private leaveHide(): void { this.player.hiddenAt = null; this.player.state = this.player.crouched ? 'Crouching' : 'Normal'; this.player.rig.setEnabled(true); }
  private distract(): void {
    if (this.save.distractionUsed) { this.events.toast('一次性声音干扰已经用完。打印机仍可以引开领导。'); return; }
    this.save.distractionUsed = true;
    const heading = this.player.rig.root.rotation.y;
    const target = { x: clamp(this.player.position.x + Math.sin(heading) * 7, -13, 13), z: clamp(this.player.position.z + Math.cos(heading) * 7, this.area * 64 + 4, this.area * 64 + 60) };
    this.noise.emit(target, 25, true); this.audio.play('printer'); this.events.toast('干扰声已投放到前方。绕开调查路线。'); this.persist();
  }
  get objective(): Interactable | null { return INTERACTABLES.find((o) => o.area === this.area && o.reward && !this.inventory.has(o.reward)) ?? (this.area === 4 ? INTERACTABLES.find((o) => o.id === 'elevator')! : null); }
  get status(): string { return this.player.state === 'Hiding' ? '已隐藏' : this.player.disguised ? '工作伪装' : this.suspicion >= 75 ? '即将发现' : this.suspicion >= 50 ? '正在调查' : this.suspicion >= 25 ? '产生怀疑' : this.player.crouched ? '安静蹲伏' : '暂时安全'; }
}

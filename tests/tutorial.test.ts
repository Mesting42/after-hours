import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TutorialSystem, firstChapterStep } from '../src/game/systems/TutorialSystem';
import { GuideRoutePlanner } from '../src/game/systems/GuideRoutePlanner';
import { NavigationSystem } from '../src/game/systems/NavigationSystem';
import { TutorialGuide } from '../src/game/scenes/TutorialGuide';
import { freshSave } from '../src/game/systems/SaveManager';

describe('first chapter teaching', () => {
  it('advances only on successful movement and actual mission rewards, then exits through the open door', () => {
    const save = freshSave(), tutorial = new TutorialSystem();
    expect(firstChapterStep(save)?.id).toBe('move');
    tutorial.recordMovement(save, 0); tutorial.recordMovement(save, NaN); tutorial.recordMovement(save, -2);
    expect(firstChapterStep(save)?.id).toBe('move');
    expect(tutorial.recordMovement(save, 0.4)).toBe(false);
    expect(tutorial.recordMovement(save, 0.4)).toBe(true);
    expect(firstChapterStep(save)?.id).toBe('shutdown');
    save.inventory.push('shutdown'); expect(firstChapterStep(save)?.target.id).toBe('badge');
    save.inventory.push('badge'); expect(firstChapterStep(save)?.target.id).toBe('office-exit');
    save.inventory.push('office-exit'); expect(firstChapterStep(save)?.target.z).toBeGreaterThan(64);
    save.area = 1; expect(firstChapterStep(save)).toBeNull();
  });
  it('restores the correct target from older saves and does not skip a task that is still in progress', () => {
    const save = freshSave(); save.tutorial = ['movement'];
    expect(firstChapterStep(save)?.id).toBe('move');
    expect(firstChapterStep(save, 'shutdown')?.id).toBe('shutdown');
    save.inventory.push('shutdown');
    expect(firstChapterStep(structuredClone(save))?.id).toBe('badge');
    const tutorial = new TutorialSystem(); tutorial.reset();
    expect(firstChapterStep(save, 'badge')?.id).toBe('badge');
    expect(tutorial.recordMovement(save, 1)).toBe(true);
    expect(tutorial.recordMovement(save, 1)).toBe(false);
  });
});

describe('collision-aware tutorial arrows', () => {
  const engines: NullEngine[] = [];
  afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
  it('routes around a wall, and every simplified segment fits the player collision radius', () => {
    const nav = new NavigationSystem([{ id: 'partition', active: true, x: 0, z: 10, w: 20, d: 0.2 }]);
    const planner = new GuideRoutePlanner(nav), from = { x: -2.3, z: 5.3 }, goal = { x: 0, z: 20 };
    const path = planner.plan(from, goal);
    expect(path[0]).toEqual(from); expect(path.at(-1)).toEqual(goal);
    expect(path.some((point) => Math.abs(point.x) > 10.43)).toBe(true);
    expect(path.slice(1).every((point, i) => planner.clear(path[i], point))).toBe(true);
  });
  it('never points through a locked full-width door, and replans through it once unlocked', () => {
    const door = { id: 'door', active: true, x: 0, z: 64, w: 32, d: 0.22 };
    const planner = new GuideRoutePlanner(new NavigationSystem([door]));
    expect(planner.plan({ x: -2, z: 59 }, { x: 0, z: 65.5 })).toEqual([]);
    door.active = false;
    const path = planner.plan({ x: -2, z: 59 }, { x: 0, z: 65.5 });
    expect(path.at(-1)).toEqual({ x: 0, z: 65.5 });
    expect(path.slice(1).every((point, i) => planner.clear(path[i], point))).toBe(true);
  });
  it('switches the rendered destination immediately and removes every guide mesh after chapter one', () => {
    const engine = new NullEngine(); engines.push(engine);
    const scene = new Scene(engine), guide = new TutorialGuide(scene, new NavigationSystem([])), save = freshSave();
    guide.update(firstChapterStep(save), { x: -8, z: 5 }, 1 / 60, false);
    expect(guide.activeTarget?.id).toBe('shutdown'); expect(guide.arrowCount).toBeGreaterThan(0);
    save.inventory.push('shutdown'); guide.update(firstChapterStep(save), { x: -8, z: 8 }, 1 / 60, true);
    expect(guide.activeTarget?.id).toBe('badge'); expect(guide.route.at(-1)).toEqual({ x: 10, z: 32 });
    save.area = 1; guide.update(firstChapterStep(save), { x: 0, z: 65 }, 1 / 60, false);
    expect(guide.activeTarget).toBeNull(); expect(guide.arrowCount).toBe(0);
    expect(scene.meshes.filter((mesh) => mesh.name.startsWith('tutorial-') && mesh.isVisible && mesh.isEnabled())).toHaveLength(0);
  });
});

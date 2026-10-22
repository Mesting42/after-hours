import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
// Quality can be toggled before Babylon's lazy shader imports finish. Register every
// used post-process shader from the installed package to keep offline switching safe.
import '@babylonjs/core/Shaders/fxaa.vertex';
import '@babylonjs/core/Shaders/fxaa.fragment';
import '@babylonjs/core/Shaders/postprocess.vertex';
import '@babylonjs/core/Shaders/imageProcessing.fragment';
import '@babylonjs/core/Shaders/pass.fragment';
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Settings } from '../types';
import { renderDensity } from '../data/quality';
import { AdaptiveQuality, qualityProfile, type QualityProfile } from './AdaptiveQuality';

export class PerformanceManager {
  private pipeline: DefaultRenderingPipeline;
  fps = 0;
  private sampleTime = 0;
  private settings?: Settings;
  readonly adaptive = new AdaptiveQuality();
  private readonly casters;
  get profile(): QualityProfile { return qualityProfile(this.settings!, this.adaptive.level); }
  constructor(private engine: Engine, private scene: Scene, camera: Camera, private shadows: ShadowGenerator, private onQualityChanged: (profile: QualityProfile) => void) {
    this.casters = [...(shadows.getShadowMap()?.renderList ?? [])];
    this.pipeline = new DefaultRenderingPipeline('office-film', false, scene, [camera]);
    this.pipeline.bloomEnabled = false; this.pipeline.chromaticAberrationEnabled = false;
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.18; scene.imageProcessingConfiguration.contrast = 1.06;
  }
  apply(s: Settings): void {
    this.settings = s; this.adaptive.reset();
    this.applyProfile();
    for (const texture of this.scene.textures) if (texture instanceof Texture) texture.updateSamplingMode(s.textureQuality < 1 ? Texture.BILINEAR_SAMPLINGMODE : Texture.TRILINEAR_SAMPLINGMODE);
  }
  /** Keep off-region geometry out of the shadow camera's bounds and draw list. */
  setArea(area: number): void {
    const map = this.shadows.getShadowMap();
    if (map) map.renderList = this.casters.filter((mesh) => mesh.metadata?.area === undefined ? mesh.isEnabled() : mesh.metadata.area === area);
  }
  /** Resizing reuses the current assessment instead of resetting it on each frame. */
  resize(): void {
    const profile = this.profile, canvas = this.engine.getRenderingCanvas();
    const cssPixels = Math.max(1, (canvas?.clientWidth ?? 1) * (canvas?.clientHeight ?? 1));
    const density = Math.min(renderDensity(devicePixelRatio, profile.renderScale), Math.sqrt(profile.maxPixels / cssPixels));
    this.engine.setHardwareScalingLevel(1 / density); this.engine.resize();
  }
  private applyProfile(): void {
    const s = this.settings!, profile = this.profile;
    this.resize();
    this.pipeline.fxaaEnabled = profile.antialias;
    this.pipeline.imageProcessingEnabled = profile.postProcessing;
    // Disabling image processing releases the post-process object in Babylon.
    const imageProcessing = this.pipeline.imageProcessing;
    if (imageProcessing) {
      imageProcessing.vignetteEnabled = profile.postProcessing && !s.highContrast;
      imageProcessing.vignetteWeight = 1.05;
    }
    this.shadows.getLight().shadowEnabled = profile.shadows;
    const shadowMap = this.shadows.getShadowMap();
    if (shadowMap && shadowMap.getSize().width !== profile.shadowSize) shadowMap.resize(profile.shadowSize);
    this.shadows.bias = 0.001; this.shadows.normalBias = 0.03;
    this.scene.skipPointerMovePicking = true;
    this.onQualityChanged(profile);
  }
  update(frameMs: number, active: boolean): void {
    // Real frame intervals are essential: simulation dt is capped to protect collision.
    if (this.settings?.autoQuality && this.adaptive.sample(frameMs, active)) this.applyProfile();
    this.sampleTime += Math.min(frameMs / 1000, .1);
    if (this.sampleTime > .5) { this.fps = Math.round(this.engine.getFps()); this.sampleTime = 0; }
  }
}

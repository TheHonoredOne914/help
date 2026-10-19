export type SceneId = "home" | "pricing" | "connect" | "account" | "calm";

/** Per-scene mix of background layers, 0…1. The engine eases between them, so switches are never abrupt. */
export type Scene = {
  pools: number;
  cursorLight: number;
  skyline: number;
  grid: number;
  particles: number;
  lines: number;
  lineSpeed: number;
  data: number;
};

export const SCENES: Record<SceneId, Scene> = {
  home: { pools: 1, cursorLight: 1, skyline: 1, grid: 0.55, particles: 1, lines: 0.3, lineSpeed: 1, data: 0 },
  pricing: { pools: 0.5, cursorLight: 0.8, skyline: 0.55, grid: 1, particles: 0.35, lines: 1, lineSpeed: 1.25, data: 0 },
  connect: { pools: 0.45, cursorLight: 0.7, skyline: 0.5, grid: 0.75, particles: 0.3, lines: 0.35, lineSpeed: 0.9, data: 1 },
  account: { pools: 0.3, cursorLight: 0.45, skyline: 0.3, grid: 0.45, particles: 0.15, lines: 0.1, lineSpeed: 0.6, data: 0 },
  calm: { pools: 0.5, cursorLight: 0.65, skyline: 0.5, grid: 0.6, particles: 0.35, lines: 0.15, lineSpeed: 0.7, data: 0 },
};

export function sceneForPath(pathname: string): SceneId {
  if (pathname === "/") return "home";
  if (/^\/(pricing|checkout)(\/|$)/.test(pathname)) return "pricing";
  if (/^\/(connect|devices)(\/|$)/.test(pathname)) return "connect";
  if (/^\/(account|payment|pay)(\/|$)/.test(pathname)) return "account";
  return "calm";
}

export const isSceneId = (v: string | undefined): v is SceneId => !!v && v in SCENES;

export function mixScene(from: Scene, to: Scene, f: number): Scene {
  const out = { ...from };
  for (const k of Object.keys(to) as (keyof Scene)[]) out[k] = from[k] + (to[k] - from[k]) * f;
  return out;
}

/** Frame-rate independent easing factor: `rate` is the per-60fps-frame fraction, `frames` the elapsed frames. */
export const easeFactor = (rate: number, frames: number) => 1 - Math.pow(1 - rate, frames);

export type Quality = 0 | 1 | 2;

/** Starting quality from device hints; the engine then adapts to the measured frame time. */
export function initialQuality(hints: { mobile: boolean; cores?: number; memoryGb?: number }): Quality {
  if (hints.mobile) return 0;
  if ((hints.cores ?? 8) <= 4 || (hints.memoryGb ?? 8) <= 4) return 1;
  return 2;
}

export function particleBudget(width: number, height: number, quality: Quality, mobile: boolean) {
  const perArea = (width * height) / 9000;
  const cap = mobile ? 45 : 150;
  return Math.round(Math.min(cap, perArea) * [0.4, 0.7, 1][quality]);
}

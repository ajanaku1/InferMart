// InferMart demo video — single source of truth for theme, timing, content.
export const FPS = 30;
export const W = 1920;
export const H = 1080;

// Theme: InferMart indigo + teal on near-black (matches the dashboards, dark for video).
export const COLORS = {
  bg: "#0a0a12",
  bgCard: "rgba(22,22,42,0.62)",
  accent: "#6b6bf5", // indigo
  accentDim: "#3a3a8f",
  accentBright: "#9a9aff",
  teal: "#1ed0bb",
  white: "#eef0f8",
  offWhite: "#aab0c8",
  muted: "#5a6080",
  border: "rgba(107,107,245,0.22)",
  red: "#ff5b6e",
  amber: "#f5b94a",
  green: "#2fd17a",
  cyan: "#22d3ee",
};

export const SCENE_GAP = Math.round(0.9 * FPS); // silent breathing room after audio

// Real ffprobe durations (seconds * FPS, rounded). whynow is provisional until regen.
export const AUDIO_DURATIONS = {
  hook: 264,
  problem: 531,
  audience: 536,
  solution: 439,
  howitworks: 487,
  livebuyer: 435,
  liveseller: 370,
  settlement: 487,
  nocloud: 342,
  whynow: 495,
  close: 364,
} as const;

export type SceneId = keyof typeof AUDIO_DURATIONS;

// Close gets extra hold for a slow fade-to-black.
const EXTRA_GAP: Partial<Record<SceneId, number>> = { close: Math.round(2.5 * FPS) };

export const SCENE_DURATIONS = Object.fromEntries(
  (Object.keys(AUDIO_DURATIONS) as SceneId[]).map((k) => [
    k,
    AUDIO_DURATIONS[k] + (EXTRA_GAP[k] ?? SCENE_GAP),
  ]),
) as Record<SceneId, number>;

export const AUDIO_FILES: Record<SceneId, string> = {
  hook: "audio/hook.mp3",
  problem: "audio/problem.mp3",
  audience: "audio/audience.mp3",
  solution: "audio/solution.mp3",
  howitworks: "audio/howitworks.mp3",
  livebuyer: "audio/livebuyer.mp3",
  liveseller: "audio/liveseller.mp3",
  settlement: "audio/settlement.mp3",
  nocloud: "audio/nocloud.mp3",
  whynow: "audio/whynow.mp3",
  close: "audio/close.mp3",
};

export const CROSSFADE = 24;

// NOTE: "whynow" is built (scene + subtitles) but omitted from this render — its
// Charon voiceover hit the daily TTS quota. Re-add it once the quota resets and
// audio/whynow.mp3 is generated, to restore the 11-scene "why now + flywheel" cut.
export const SCENE_ORDER: SceneId[] = [
  "hook",
  "problem",
  "audience",
  "solution",
  "howitworks",
  "livebuyer",
  "liveseller",
  "settlement",
  "nocloud",
  "close",
];

export const TOTAL_FRAMES =
  SCENE_ORDER.reduce((a, k) => a + SCENE_DURATIONS[k], 0) -
  CROSSFADE * (SCENE_ORDER.length - 1);

// Social clip
export const SOCIAL_FPS = 30;
export const SOCIAL_W = 1080;
export const SOCIAL_H = 1920;
export const SOCIAL_DURATION = 11 * FPS;

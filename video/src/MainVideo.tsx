import React from "react";
import { AbsoluteFill, Audio, staticFile, interpolate } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { COLORS, CROSSFADE, FPS, AUDIO_DURATIONS, SCENE_DURATIONS, AUDIO_FILES, SCENE_ORDER, SceneId } from "./constants";
import { Subtitles } from "./Subtitles";
import { Hook } from "./scenes/Hook";
import { Problem } from "./scenes/Problem";
import { Audience } from "./scenes/Audience";
import { Solution } from "./scenes/Solution";
import { HowItWorks } from "./scenes/HowItWorks";
import { LiveDemo } from "./scenes/LiveDemo";
import { LiveSeller } from "./scenes/LiveSeller";
import { Settlement } from "./scenes/Settlement";
import { NoCloud } from "./scenes/NoCloud";
import { WhyNow } from "./scenes/WhyNow";
import { Close } from "./scenes/Close";

const COMPONENTS: Record<SceneId, React.FC> = {
  hook: Hook,
  problem: Problem,
  audience: Audience,
  solution: Solution,
  howitworks: HowItWorks,
  livebuyer: LiveDemo,
  liveseller: LiveSeller,
  settlement: Settlement,
  nocloud: NoCloud,
  whynow: WhyNow,
  close: Close,
};

const SceneAudio: React.FC<{ src: string; audioDuration: number }> = ({ src, audioDuration }) => (
  <Audio
    src={staticFile(src)}
    volume={(f) => {
      const fadeIn = interpolate(f, [0, Math.round(FPS * 0.25)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const fadeOut = interpolate(f, [audioDuration - FPS, audioDuration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return Math.min(fadeIn, fadeOut);
    }}
  />
);

export const MainVideo: React.FC = () => {
  const timing = linearTiming({ durationInFrames: CROSSFADE });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <TransitionSeries>
        {SCENE_ORDER.flatMap((id, i) => {
          const Comp = COMPONENTS[id];
          const seq = (
            <TransitionSeries.Sequence key={id} durationInFrames={SCENE_DURATIONS[id]}>
              <Comp />
              <SceneAudio src={AUDIO_FILES[id]} audioDuration={AUDIO_DURATIONS[id]} />
            </TransitionSeries.Sequence>
          );
          if (i === SCENE_ORDER.length - 1) return [seq];
          return [seq, <TransitionSeries.Transition key={`t-${id}`} presentation={fade()} timing={timing} />];
        })}
      </TransitionSeries>
      <Subtitles />
    </AbsoluteFill>
  );
};

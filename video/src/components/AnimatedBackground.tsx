import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

type Orb = { baseX: number; baseY: number; size: number; color: string; blur: number; opacity: number; speed: number };

const ORBS: Orb[] = [
  { baseX: 260, baseY: 220, size: 500, color: "#6b6bf5", blur: 130, opacity: 0.13, speed: 0.006 },
  { baseX: 1560, baseY: 800, size: 440, color: "#1ed0bb", blur: 120, opacity: 0.1, speed: 0.005 },
  { baseX: 960, baseY: 520, size: 560, color: "#3a3a8f", blur: 150, opacity: 0.09, speed: 0.008 },
  { baseX: 1680, baseY: 180, size: 360, color: "#9a9aff", blur: 110, opacity: 0.07, speed: 0.007 },
  { baseX: 200, baseY: 840, size: 320, color: "#1ed0bb", blur: 110, opacity: 0.06, speed: 0.009 },
];

export const AnimatedBackground: React.FC<{ orbs?: Orb[] }> = ({ orbs = ORBS }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#0a0a12" }}>
      {orbs.map((orb, i) => {
        const x = orb.baseX + Math.sin(frame * orb.speed + i * 1.5) * 90;
        const y = orb.baseY + Math.cos(frame * orb.speed + i * 2.1) * 70;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - orb.size / 2,
              top: y - orb.size / 2,
              width: orb.size,
              height: orb.size,
              borderRadius: "50%",
              background: orb.color,
              filter: `blur(${orb.blur}px)`,
              opacity: orb.opacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

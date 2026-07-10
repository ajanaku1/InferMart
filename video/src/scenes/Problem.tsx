import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Scene } from "../components/Scene";
import { GlowText } from "../components/GlowText";
import { GlassCard } from "../components/GlassCard";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

const PAINS = [
  { tag: "THE MARKUP", head: "You rent someone else's GPU", sub: "and pay their margin on every token.", color: COLORS.amber },
  { tag: "THE EXPOSURE", head: "Every prompt leaves your device", sub: "into a datacenter you'll never see.", color: COLORS.red },
  { tag: "THE FRAGILITY", head: "Lose connection, lose your AI", sub: "one company, one bill, one outage.", color: COLORS.red },
];

export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene>
      <GlowText text="So we rent the cloud instead." fontSize={46} color={COLORS.white} delay={2} fontWeight={800} style={{ marginBottom: 46 }} />
      <div style={{ display: "flex", gap: 26, width: 1640 }}>
        {PAINS.map((p, i) => {
          const prog = spring({ frame: frame - (26 + i * 28), fps, config: { damping: 15, stiffness: 95 } });
          const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          const y = interpolate(prog, [0, 1], [24, 0]);
          return (
            <div key={i} style={{ flex: 1, opacity: op, transform: `translateY(${y}px)` }}>
              <GlassCard borderColor={`${p.color}3a`} style={{ height: 250 }}>
                <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 800, letterSpacing: 2, color: p.color, marginBottom: 18 }}>{p.tag}</div>
                <div style={{ fontFamily: INTER, fontSize: 27, fontWeight: 800, color: COLORS.white, lineHeight: 1.25, marginBottom: 12 }}>{p.head}</div>
                <div style={{ fontFamily: INTER, fontSize: 20, color: COLORS.offWhite, lineHeight: 1.45 }}>{p.sub}</div>
              </GlassCard>
            </div>
          );
        })}
      </div>
    </Scene>
  );
};

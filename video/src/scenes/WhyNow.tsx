import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Scene } from "../components/Scene";
import { GlowText } from "../components/GlowText";
import { GlassCard } from "../components/GlassCard";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

const PILLARS = [
  { label: "Models shrank", detail: "Capable 1–4B models finally run well on everyday hardware.", color: COLORS.accent },
  { label: "Money got rails", detail: "Stablecoins settle a fraction-of-a-cent payment, instantly.", color: COLORS.teal },
  { label: "P2P grew up", detail: "Mature networking connects any two devices, anywhere.", color: COLORS.accentBright },
];

export const WhyNow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flyProg = spring({ frame: frame - 300, fps, config: { damping: 16, stiffness: 90 } });
  const flyOp = interpolate(flyProg, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
  return (
    <Scene>
      <GlowText text="Why this works now" fontSize={46} color={COLORS.white} delay={2} fontWeight={800} style={{ marginBottom: 46 }} />
      <div style={{ display: "flex", gap: 26, width: 1640, marginBottom: 38 }}>
        {PILLARS.map((p, i) => {
          const prog = spring({ frame: frame - (26 + i * 26), fps, config: { damping: 15, stiffness: 95 } });
          const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          const y = interpolate(prog, [0, 1], [24, 0]);
          return (
            <div key={i} style={{ flex: 1, opacity: op, transform: `translateY(${y}px)` }}>
              <GlassCard borderColor={`${p.color}3a`} style={{ height: 200 }}>
                <div style={{ fontFamily: INTER, fontSize: 26, fontWeight: 800, color: p.color, marginBottom: 14 }}>{p.label}</div>
                <div style={{ fontFamily: INTER, fontSize: 21, color: COLORS.offWhite, lineHeight: 1.5 }}>{p.detail}</div>
              </GlassCard>
            </div>
          );
        })}
      </div>
      <div style={{ opacity: flyOp, fontFamily: INTER, fontSize: 26, fontWeight: 600, color: COLORS.white, textAlign: "center", background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "16px 30px", maxWidth: 1200 }}>
        Every device that joins makes inference cheaper <span style={{ color: COLORS.teal }}>→</span> more buyers <span style={{ color: COLORS.teal }}>→</span> more sellers. A flywheel.
      </div>
    </Scene>
  );
};

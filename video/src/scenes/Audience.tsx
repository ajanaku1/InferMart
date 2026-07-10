import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Scene } from "../components/Scene";
import { GlowText } from "../components/GlowText";
import { GlassCard } from "../components/GlassCard";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

const WHO = [
  { icon: "🔒", label: "Privacy-first", detail: "Keep prompts on devices you control, never a third-party datacenter.", color: COLORS.accent },
  { icon: "⚙︎", label: "Builders", detail: "Cut inference bills that quietly eat the margin on every AI feature.", color: COLORS.teal },
  { icon: "📡", label: "The edge", detail: "Run where the cloud is slow, expensive, metered, or simply absent.", color: COLORS.accentBright },
];

export const Audience: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene>
      <GlowText text="Who feels this most" fontSize={46} color={COLORS.white} delay={2} fontWeight={800} style={{ marginBottom: 14 }} />
      <GlowText text="Demand for cheap, private inference is exploding. The supply is already in people's hands." fontSize={24} color={COLORS.offWhite} delay={12} fontWeight={500} glowIntensity={0.3} style={{ marginBottom: 44, textAlign: "center", maxWidth: 1100 }} />
      <div style={{ display: "flex", gap: 26, width: 1640 }}>
        {WHO.map((w, i) => {
          const prog = spring({ frame: frame - (40 + i * 26), fps, config: { damping: 15, stiffness: 95 } });
          const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          const y = interpolate(prog, [0, 1], [24, 0]);
          return (
            <div key={i} style={{ flex: 1, opacity: op, transform: `translateY(${y}px)` }}>
              <GlassCard borderColor={`${w.color}3a`} style={{ height: 240 }}>
                <div style={{ fontSize: 38, marginBottom: 16 }}>{w.icon}</div>
                <div style={{ fontFamily: INTER, fontSize: 26, fontWeight: 800, color: w.color, marginBottom: 12 }}>{w.label}</div>
                <div style={{ fontFamily: INTER, fontSize: 20, color: COLORS.offWhite, lineHeight: 1.5 }}>{w.detail}</div>
              </GlassCard>
            </div>
          );
        })}
      </div>
    </Scene>
  );
};

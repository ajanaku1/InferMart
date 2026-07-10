import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Scene } from "../components/Scene";
import { GlowText } from "../components/GlowText";
import { GlassCard } from "../components/GlassCard";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";

const STEPS = [
  { n: "1", label: "Seller hosts", detail: "A laptop loads a model and opens a P2P endpoint over Holepunch.", color: COLORS.accent },
  { n: "2", label: "Buyer asks", detail: "A device with no model sends a prompt straight to that peer.", color: COLORS.teal },
  { n: "3", label: "Stream + settle", detail: "The answer runs on the seller's hardware and streams back, metered.", color: COLORS.accentBright },
];

export const HowItWorks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene>
      <GlowText text="Three moves" fontSize={46} color={COLORS.white} delay={2} fontWeight={800} style={{ marginBottom: 46 }} />
      <div style={{ display: "flex", gap: 28, width: 1620 }}>
        {STEPS.map((s, i) => {
          const prog = spring({ frame: frame - (24 + i * 26), fps, config: { damping: 15, stiffness: 90 } });
          const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          const y = interpolate(prog, [0, 1], [26, 0]);
          const scale = interpolate(prog, [0, 1], [0.95, 1]);
          return (
            <div key={i} style={{ flex: 1, opacity: op, transform: `translateY(${y}px) scale(${scale})` }}>
              <GlassCard borderColor={`${s.color}40`} style={{ height: 270 }}>
                <div style={{ width: 50, height: 50, borderRadius: 12, background: `${s.color}22`, border: `1px solid ${s.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 22, fontWeight: 700, color: s.color, marginBottom: 22, textShadow: `0 0 12px ${s.color}` }}>{s.n}</div>
                <div style={{ fontFamily: INTER, fontSize: 28, fontWeight: 800, color: COLORS.white, marginBottom: 12 }}>{s.label}</div>
                <div style={{ fontFamily: INTER, fontSize: 20, color: COLORS.offWhite, lineHeight: 1.5 }}>{s.detail}</div>
              </GlassCard>
            </div>
          );
        })}
      </div>
    </Scene>
  );
};

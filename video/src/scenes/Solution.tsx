import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Scene } from "../components/Scene";
import { GlowText } from "../components/GlowText";
import { GlassCard, BrandMark } from "../components/GlassCard";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";

const Side: React.FC<{ title: string; sub: string; color: string; delay: number; align: "left" | "right" }> = ({ title, sub, color, delay, align }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const prog = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 110 } });
  const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const x = interpolate(prog, [0, 1], [align === "left" ? -40 : 40, 0]);
  return (
    <div style={{ width: 460, opacity: op, transform: `translateX(${x}px)` }}>
      <GlassCard borderColor={`${color}45`} style={{ textAlign: "center" }}>
        <div style={{ fontFamily: INTER, fontSize: 30, fontWeight: 800, color, marginBottom: 10 }}>{title}</div>
        <div style={{ fontFamily: INTER, fontSize: 20, color: COLORS.offWhite, lineHeight: 1.45 }}>{sub}</div>
      </GlassCard>
    </div>
  );
};

export const Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hubProg = spring({ frame: frame - 30, fps, config: { damping: 13, stiffness: 90 } });
  const hubScale = interpolate(hubProg, [0, 1], [0.7, 1]);
  const hubOp = interpolate(hubProg, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const flow = interpolate(frame, [55, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Scene>
      <GlowText text="A two-sided market for inference" fontSize={46} color={COLORS.white} delay={2} fontWeight={800} style={{ marginBottom: 60 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <Side title="Sellers" sub="Idle laptops and phones rent out spare compute, and earn." color={COLORS.teal} delay={16} align="left" />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: flow }}>
          <div style={{ fontFamily: MONO, fontSize: 14, color: COLORS.teal }}>compute →</div>
          <div style={{ width: 80, height: 2, background: `linear-gradient(90deg, ${COLORS.teal}, ${COLORS.accent})` }} />
          <div style={{ fontFamily: MONO, fontSize: 14, color: COLORS.accent }}>← USDT</div>
        </div>

        <div style={{ opacity: hubOp, transform: `scale(${hubScale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <BrandMark size={96} />
          <div style={{ fontFamily: INTER, fontSize: 28, fontWeight: 900, color: COLORS.white }}>InferMart</div>
          <div style={{ fontFamily: MONO, fontSize: 14, color: COLORS.muted }}>P2P · no servers</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: flow }}>
          <div style={{ fontFamily: MONO, fontSize: 14, color: COLORS.accent }}>prompt →</div>
          <div style={{ width: 80, height: 2, background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.teal})` }} />
          <div style={{ fontFamily: MONO, fontSize: 14, color: COLORS.teal }}>← answer</div>
        </div>

        <Side title="Buyers" sub="Anyone needing an answer pays per token in stablecoin." color={COLORS.accentBright} delay={16} align="right" />
      </div>
    </Scene>
  );
};

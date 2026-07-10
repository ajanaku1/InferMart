import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill } from "remotion";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { GlowText } from "../components/GlowText";
import { BrandMark } from "../components/GlassCard";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";

const Corner: React.FC<{ pos: React.CSSProperties; op: number }> = ({ pos, op }) => (
  <div style={{ position: "absolute", width: 56, height: 56, borderColor: COLORS.accent, opacity: op, ...pos }} />
);

const STATS = [
  { v: "0 servers", k: "fully peer-to-peer" },
  { v: "USDT", k: "settled on-chain" },
  { v: "offline-proof", k: "works without WAN" },
];

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const logoProg = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 90 } });
  const logoScale = interpolate(logoProg, [0, 1], [0.85, 1]);
  const logoOp = interpolate(logoProg, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const cornerOp = interpolate(frame, [0, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fade = interpolate(frame, [durationInFrames - 60, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <AnimatedBackground />
      <Corner pos={{ top: 60, left: 60, borderTop: `3px solid`, borderLeft: `3px solid` }} op={cornerOp} />
      <Corner pos={{ top: 60, right: 60, borderTop: `3px solid`, borderRight: `3px solid` }} op={cornerOp} />
      <Corner pos={{ bottom: 60, left: 60, borderBottom: `3px solid`, borderLeft: `3px solid` }} op={cornerOp} />
      <Corner pos={{ bottom: 60, right: 60, borderBottom: `3px solid`, borderRight: `3px solid` }} op={cornerOp} />

      <AbsoluteFill style={{ flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 22, opacity: logoOp, transform: `scale(${logoScale})` }}>
          <BrandMark size={84} />
          <div style={{ fontFamily: INTER, fontSize: 88, fontWeight: 900, background: `linear-gradient(135deg, ${COLORS.accentBright}, ${COLORS.accent}, ${COLORS.teal})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>InferMart</div>
        </div>
        <GlowText text="Idle laptops, selling AI to each other." fontSize={34} color={COLORS.offWhite} delay={22} fontWeight={500} style={{ marginBottom: 44, textAlign: "center" }} />

        <div style={{ display: "flex", gap: 56, marginBottom: 50 }}>
          {STATS.map((s, i) => {
            const p = spring({ frame: frame - (44 + i * 16), fps, config: { damping: 16, stiffness: 120 } });
            const op = interpolate(p, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
            const y = interpolate(p, [0, 1], [14, 0]);
            return (
              <div key={i} style={{ textAlign: "center", opacity: op, transform: `translateY(${y}px)` }}>
                <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: COLORS.accentBright }}>{s.v}</div>
                <div style={{ fontFamily: INTER, fontSize: 18, color: COLORS.muted, marginTop: 6 }}>{s.k}</div>
              </div>
            );
          })}
        </div>

        <GlowText text="github.com/ajanaku1/InferMart" fontSize={30} color={COLORS.teal} delay={108} fontWeight={600} fontFamily={MONO} style={{ marginBottom: 16 }} />
        <GlowText text="Built for the Tether QVAC Hackathon · QVAC + WDK + Holepunch" fontSize={20} color={COLORS.muted} delay={124} fontWeight={500} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

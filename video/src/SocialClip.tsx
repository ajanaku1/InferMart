import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { GlowText } from "./components/GlowText";
import { BrandMark } from "./components/GlassCard";
import { COLORS, SOCIAL_DURATION } from "./constants";
import { INTER, MONO } from "./fonts";

const VERTICAL_ORBS = [
  { baseX: 200, baseY: 320, size: 420, color: "#6b6bf5", blur: 130, opacity: 0.13, speed: 0.006 },
  { baseX: 880, baseY: 1600, size: 380, color: "#1ed0bb", blur: 120, opacity: 0.1, speed: 0.005 },
  { baseX: 540, baseY: 980, size: 500, color: "#3a3a8f", blur: 150, opacity: 0.08, speed: 0.008 },
  { baseX: 120, baseY: 1420, size: 320, color: "#9a9aff", blur: 110, opacity: 0.07, speed: 0.007 },
];

export const SocialClip: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitOp = interpolate(frame, [SOCIAL_DURATION - 18, SOCIAL_DURATION], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logoProg = spring({ frame: frame - 28, fps, config: { damping: 16, stiffness: 120 } });
  const logoOp = interpolate(logoProg, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground orbs={VERTICAL_ORBS} />
      <AbsoluteFill style={{ flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "80px 60px", opacity: exitOp }}>
        <GlowText text="Pay-per-token" fontSize={64} color={COLORS.teal} delay={4} fontWeight={800} glowIntensity={1.2} style={{ textAlign: "center" }} />
        <GlowText text="AI FROM YOUR BLOCK" fontSize={40} color={COLORS.offWhite} delay={14} fontWeight={700} style={{ letterSpacing: 4, marginBottom: 90, textAlign: "center" }} />
        <div style={{ opacity: logoOp, marginBottom: 26 }}>
          <BrandMark size={130} />
        </div>
        <GlowText text="InferMart" fontSize={76} color={COLORS.white} delay={36} fontWeight={900} style={{ marginBottom: 22 }} />
        <GlowText text="Rent a peer's idle AI. Settle in USDT." fontSize={36} color={COLORS.accentBright} delay={52} fontWeight={600} glowIntensity={0.7} style={{ textAlign: "center", marginBottom: 70 }} />
        <GlowText text="P2P · works even offline" fontSize={26} color={COLORS.muted} delay={70} fontWeight={500} fontFamily={MONO} style={{ textAlign: "center" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

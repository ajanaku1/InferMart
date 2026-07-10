import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Scene } from "../components/Scene";
import { GlowText } from "../components/GlowText";
import { BrandMark } from "../components/GlassCard";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // brand pinned top-left
  const brandOp = interpolate(frame, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // big stat
  const statProg = spring({ frame: frame - 18, fps, config: { damping: 14, stiffness: 80 } });
  const statScale = interpolate(statProg, [0, 1], [0.92, 1]);
  const statOp = interpolate(statProg, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });

  return (
    <Scene center={false}>
      <div style={{ position: "absolute", top: 60, left: 70, display: "flex", alignItems: "center", gap: 16, opacity: brandOp }}>
        <BrandMark size={44} />
        <div style={{ fontFamily: INTER, fontSize: 30, fontWeight: 800, color: COLORS.white }}>InferMart</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
        <div style={{ opacity: statOp, transform: `scale(${statScale})`, textAlign: "center" }}>
          <div style={{ fontFamily: INTER, fontSize: 130, fontWeight: 900, lineHeight: 1, background: `linear-gradient(135deg, ${COLORS.accentBright}, ${COLORS.teal})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Billions</div>
          <div style={{ fontFamily: INTER, fontSize: 44, fontWeight: 700, color: COLORS.white, marginTop: 14 }}>of devices can run real AI.</div>
        </div>
        <GlowText text="Almost every one of them is sitting idle." fontSize={34} color={COLORS.offWhite} delay={46} fontWeight={500} glowIntensity={0.4} style={{ marginTop: 40, textAlign: "center" }} />
      </div>
    </Scene>
  );
};

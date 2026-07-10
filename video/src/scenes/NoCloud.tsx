import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Scene } from "../components/Scene";
import { GlowText } from "../components/GlowText";
import { GlassCard } from "../components/GlassCard";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";

const CUT_FRAME = 150;

export const NoCloud: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cut = frame >= CUT_FRAME;

  // flash when wifi is cut
  const flash = interpolate(frame, [CUT_FRAME, CUT_FRAME + 8], [0.25, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = 0.6 + Math.sin(frame * 0.18) * 0.4;

  const Row: React.FC<{ label: string; value: string; color: string; struck?: boolean; live?: boolean }> = ({ label, value, color, struck, live }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: `1px solid ${COLORS.border}` }}>
      <div style={{ fontFamily: INTER, fontSize: 24, color: COLORS.offWhite }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {live && <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, opacity: pulse, boxShadow: `0 0 10px ${color}` }} />}
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color, textDecoration: struck ? "line-through" : "none" }}>{value}</div>
      </div>
    </div>
  );

  return (
    <Scene>
      <GlowText text="Cut the internet. It keeps going." fontSize={46} color={COLORS.white} delay={2} fontWeight={800} style={{ marginBottom: 40, textAlign: "center" }} />
      <GlassCard delay={18} borderColor={`${COLORS.accent}40`} style={{ width: 900 }}>
        <Row label="Cloud connection" value={cut ? "OFFLINE" : "online"} color={cut ? COLORS.red : COLORS.muted} struck={cut} />
        <Row label="Wi-Fi / WAN" value={cut ? "DISCONNECTED" : "connected"} color={cut ? COLORS.red : COLORS.muted} struck={cut} />
        <Row label="P2P peer link" value="connected" color={COLORS.teal} live />
        <Row label="Inference" value="STREAMING" color={COLORS.green} live />
      </GlassCard>
      <GlowText text="Two machines, one local link. Nothing to disconnect." fontSize={26} color={COLORS.offWhite} delay={40} fontWeight={500} glowIntensity={0.4} style={{ marginTop: 36, textAlign: "center" }} />
      <div style={{ position: "absolute", inset: 0, background: COLORS.red, opacity: flash, pointerEvents: "none" }} />
    </Scene>
  );
};

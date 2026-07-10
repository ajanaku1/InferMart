import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Scene } from "../components/Scene";
import { GlowText } from "../components/GlowText";
import { GlassCard } from "../components/GlassCard";
import { COLORS } from "../constants";
import { INTER, MONO } from "../fonts";

const TX = "0x86ef9b16d29f32e578a4159c1756c7594bf0dbce8eea9b42b5bc0201eeb9f082";

export const Settlement: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // tx hash typewriter
  const hashChars = Math.max(0, Math.min(TX.length, Math.floor((frame - 110) * 1.1)));
  const visibleHash = TX.slice(0, hashChars);
  const checkProg = spring({ frame: frame - 230, fps, config: { damping: 14, stiffness: 120 } });
  const checkScale = interpolate(checkProg, [0, 1], [0.4, 1]);
  const checkOp = interpolate(checkProg, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });

  // balance count up
  const bal = interpolate(frame, [250, 360], [0.003348, 0.003395], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Scene>
      <GlowText text="Paid in real USDT" fontSize={46} color={COLORS.white} delay={2} fontWeight={800} style={{ marginBottom: 44 }} />
      <div style={{ display: "flex", gap: 30, width: 1480, alignItems: "stretch" }}>
        <GlassCard delay={20} borderColor={`${COLORS.accent}40`} style={{ flex: 1 }}>
          <div style={{ fontFamily: INTER, fontSize: 18, color: COLORS.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>This request</div>
          <div style={{ fontFamily: MONO, fontSize: 58, fontWeight: 700, color: COLORS.accentBright }}>0.000047</div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: COLORS.offWhite, marginTop: 6 }}>USDT · 47 generated tokens</div>
          <div style={{ height: 1, background: COLORS.border, margin: "22px 0" }} />
          <div style={{ fontFamily: INTER, fontSize: 20, color: COLORS.offWhite }}>Metered by token, never overcharged. The buyer's spend cap blocks anything over budget before it sends.</div>
        </GlassCard>

        <GlassCard delay={40} borderColor={`${COLORS.teal}40`} style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: INTER, fontSize: 18, color: COLORS.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>On-chain · Sepolia</div>
            <div style={{ opacity: checkOp, transform: `scale(${checkScale})`, width: 34, height: 34, borderRadius: "50%", background: `${COLORS.green}22`, border: `1px solid ${COLORS.green}`, color: COLORS.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800 }}>✓</div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 17, color: COLORS.cyan, wordBreak: "break-all", lineHeight: 1.6, minHeight: 84 }}>
            {visibleHash}
            {hashChars < TX.length && frame > 110 ? <span style={{ color: COLORS.accent }}>_</span> : null}
          </div>
          <div style={{ height: 1, background: COLORS.border, margin: "20px 0" }} />
          <div style={{ fontFamily: INTER, fontSize: 18, color: COLORS.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Seller balance (read from chain)</div>
          <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, color: COLORS.green }}>{bal.toFixed(6)} <span style={{ fontSize: 22, color: COLORS.offWhite }}>USDT</span></div>
        </GlassCard>
      </div>
    </Scene>
  );
};

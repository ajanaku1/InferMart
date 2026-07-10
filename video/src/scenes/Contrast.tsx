import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Scene } from "../components/Scene";
import { GlowText } from "../components/GlowText";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

const CLOUD = ["Rent a whole datacenter", "Pay the provider's markup", "Every prompt leaves your device", "Wi-Fi drops, it's gone"];
const INFER = ["Borrow a peer's spare model", "Pay only for tokens used", "Runs on a device you can see", "Works over a local link"];

const Col: React.FC<{ title: string; items: string[]; positive: boolean; delay: number }> = ({ title, items, positive, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const prog = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 150 } });
  const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const x = interpolate(prog, [0, 1], [positive ? 40 : -40, 0]);
  const c = positive ? COLORS.teal : COLORS.red;
  return (
    <div style={{ flex: 1, opacity: op, transform: `translateX(${x}px)` }}>
      <div style={{ fontFamily: INTER, fontSize: 24, fontWeight: 800, color: c, letterSpacing: 1, marginBottom: 22, textTransform: "uppercase" }}>{title}</div>
      {items.map((it, i) => {
        const ip = spring({ frame: frame - delay - 10 - i * 12, fps, config: { damping: 16, stiffness: 140 } });
        const iop = interpolate(ip, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
        return (
          <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18, opacity: iop }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${c}22`, border: `1px solid ${c}55`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: INTER, fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
              {positive ? "+" : "×"}
            </div>
            <div style={{ fontFamily: INTER, fontSize: 26, color: COLORS.white }}>{it}</div>
          </div>
        );
      })}
    </div>
  );
};

export const Contrast: React.FC = () => {
  const frame = useCurrentFrame();
  const divider = interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Scene>
      <GlowText text="Cloud AI, or your block?" fontSize={46} color={COLORS.white} delay={2} fontWeight={800} style={{ marginBottom: 50 }} />
      <div style={{ display: "flex", gap: 56, width: 1500, alignItems: "flex-start" }}>
        <Col title="Cloud AI" items={CLOUD} positive={false} delay={14} />
        <div style={{ width: 1, alignSelf: "stretch", background: `linear-gradient(180deg, transparent, ${COLORS.accent}, transparent)`, opacity: divider }} />
        <Col title="InferMart" items={INFER} positive delay={50} />
      </div>
    </Scene>
  );
};

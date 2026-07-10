import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../constants";

export const GlassCard: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  delay?: number;
  borderColor?: string;
}> = ({ children, style, delay = 0, borderColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const prog = spring({ frame: frame - delay, fps, config: { mass: 1, damping: 15, stiffness: 80 } });
  const opacity = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(prog, [0, 1], [18, 0]);
  const scale = interpolate(prog, [0, 1], [0.95, 1]);
  return (
    <div
      style={{
        background: COLORS.bgCard,
        border: `1px solid ${borderColor ?? COLORS.border}`,
        borderRadius: 18,
        padding: "26px 30px",
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
        boxShadow: `0 20px 60px rgba(0,0,0,0.35), 0 0 40px ${COLORS.accent}10`,
        backdropFilter: "blur(8px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const BrandMark: React.FC<{ size?: number; glow?: boolean }> = ({ size = 56, glow = true }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    style={{ borderRadius: size * 0.23, boxShadow: glow ? `0 8px 28px ${COLORS.accent}55` : undefined, flexShrink: 0, display: "block" }}
  >
    <defs>
      <linearGradient id="brandGrad" x1="24" y1="24" x2="232" y2="232" gradientUnits="userSpaceOnUse">
        <stop stopColor={COLORS.accent} />
        <stop offset="1" stopColor={COLORS.teal} />
      </linearGradient>
    </defs>
    <rect x="8" y="8" width="240" height="240" rx="58" fill="url(#brandGrad)" />
    <g fill="#fff">
      <circle cx="84" cy="128" r="26" fill="none" stroke="#fff" strokeWidth="13" />
      <circle cx="120" cy="128" r="5.5" />
      <circle cx="136" cy="128" r="5.5" />
      <circle cx="152" cy="128" r="5.5" />
      <circle cx="186" cy="128" r="24" />
    </g>
  </svg>
);

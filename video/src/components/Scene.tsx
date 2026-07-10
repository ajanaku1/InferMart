import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { AnimatedBackground } from "./AnimatedBackground";

// Wraps a scene with the animated background and a gentle exit fade on the last 14 frames.
export const Scene: React.FC<{ children: React.ReactNode; center?: boolean }> = ({ children, center = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const exit = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity: exit }}>
      <AnimatedBackground />
      <AbsoluteFill
        style={{
          flexDirection: "column",
          justifyContent: center ? "center" : "flex-start",
          alignItems: "center",
          padding: 80,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

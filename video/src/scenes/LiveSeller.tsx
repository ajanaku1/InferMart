import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, OffthreadVideo, staticFile, Img } from "remotion";
import { Scene } from "../components/Scene";
import { GlowText } from "../components/GlowText";
import { COLORS } from "../constants";
import { INTER } from "../fonts";

const VIDEO_START = 40;

export const LiveSeller: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleOp = interpolate(frame, [0, 14, 34, 48], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const frameProg = spring({ frame: frame - VIDEO_START + 6, fps, config: { damping: 18, stiffness: 130 } });
  const frameOp = interpolate(frameProg, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
  const frameScale = interpolate(frameProg, [0, 1], [1.03, 1]);
  const calloutProg = spring({ frame: frame - 150, fps, config: { damping: 16, stiffness: 90 } });
  const calloutOp = interpolate(calloutProg, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
  return (
    <Scene center>
      <div style={{ position: "absolute", top: 70, opacity: titleOp }}>
        <GlowText text="The seller — idle hardware, now earning" fontSize={40} color={COLORS.teal} fontWeight={700} />
      </div>
      <div style={{ width: 1560, height: 878, borderRadius: 18, overflow: "hidden", border: `1px solid ${COLORS.border}`, boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 60px ${COLORS.teal}1c`, opacity: frameOp, transform: `scale(${frameScale})`, background: "#0a0a12" }}>
        {frame >= VIDEO_START ? (
          <OffthreadVideo src={staticFile("assets/rec/seller.mp4")} playbackRate={1.5} muted style={{ width: 1560, height: 878, objectFit: "cover" }} />
        ) : (
          <Img src={staticFile("assets/seller.png")} style={{ width: 1560 }} />
        )}
      </div>
      <div style={{ position: "absolute", bottom: 70, opacity: calloutOp, background: `${COLORS.bg}e6`, border: `1px solid ${COLORS.green}66`, borderRadius: 12, padding: "12px 22px", fontFamily: INTER, fontSize: 24, fontWeight: 700, color: COLORS.green, backdropFilter: "blur(8px)" }}>
        every finished request, settled on-chain
      </div>
    </Scene>
  );
};

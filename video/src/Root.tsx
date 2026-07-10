import React from "react";
import { Composition, registerRoot } from "remotion";
import { MainVideo } from "./MainVideo";
import { SocialClip } from "./SocialClip";
import { FPS, W, H, TOTAL_FRAMES, SOCIAL_FPS, SOCIAL_W, SOCIAL_H, SOCIAL_DURATION } from "./constants";

const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Main" component={MainVideo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} />
    <Composition id="Social" component={SocialClip} durationInFrames={SOCIAL_DURATION} fps={SOCIAL_FPS} width={SOCIAL_W} height={SOCIAL_H} />
  </>
);

registerRoot(RemotionRoot);

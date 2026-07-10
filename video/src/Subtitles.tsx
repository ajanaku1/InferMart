import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { INTER } from "./fonts";
import { AUDIO_DURATIONS, CROSSFADE, SCENE_ORDER, SCENE_DURATIONS, SceneId } from "./constants";

const SENTENCES: Record<SceneId, string[]> = {
  hook: ["There are billions of laptops and phones powerful enough to run real AI models.", "Almost every single one of them is sitting completely idle."],
  problem: ["So we rent the cloud instead. You pay a fat markup on someone else's GPU.", "Every prompt you send leaves your device. And the moment your connection drops, your AI is gone.", "One company, one bill, one point of failure."],
  audience: ["This stings most if you care about privacy, if you're a builder watching inference costs eat your margin,", "or if you're somewhere the cloud is slow, pricey, or just not there.", "Demand for cheap, private inference is exploding. The supply is already in people's hands."],
  solution: ["InferMart connects the two. It's a peer-to-peer marketplace for inference.", "Anyone with a capable device becomes a seller, renting out spare compute.", "Anyone who needs an answer becomes a buyer, paying per token in stablecoin."],
  howitworks: ["Three moves. A seller loads a model and opens a peer-to-peer endpoint over Holepunch.", "A buyer with no model sends a prompt straight to that peer.", "The work runs on the seller's hardware and streams right back. No servers in the middle."],
  livebuyer: ["Here's a buyer with no model at all.", "I ask a question, it travels over the encrypted peer link, and the tokens come back one at a time.", "Real inference, running on a stranger's laptop, that never touched a datacenter."],
  liveseller: ["On the other side, the seller just watches the work roll in. Idle hardware, now earning.", "Every finished request is a payment, settled on-chain, with no middleman taking a cut."],
  settlement: ["Each answer is metered by token and paid in real USDT.", "There's the transaction hash, live on Sepolia.", "The seller trusts the chain, not the buyer, reading its own balance as it climbs.", "And the buyer sets a hard spend cap, so a runaway bill simply can't happen."],
  nocloud: ["Now the part cloud AI can't touch.", "Mid-answer, I cut the internet. And it keeps going.", "The two machines are talking over a local link. There is nothing to disconnect."],
  whynow: ["This works now for a reason. Small models finally run well on everyday hardware.", "Stablecoins make a fraction-of-a-cent payment actually settle. Peer-to-peer networking grew up.", "Every idle device that joins makes inference cheaper, which pulls in more buyers, and more sellers."],
  close: ["InferMart. Idle devices, selling AI to each other, settled in stablecoin.", "Working even when the internet doesn't.", "The world's compute is already out there. We just gave it a market."],
};

type Entry = { text: string; start: number; end: number };

function buildEntries(): Entry[] {
  const entries: Entry[] = [];
  let sceneStart = 0;
  for (const id of SCENE_ORDER) {
    const audio = AUDIO_DURATIONS[id];
    const sentences = SENTENCES[id];
    const words = sentences.map((s) => s.split(/\s+/).length);
    const totalWords = words.reduce((a, b) => a + b, 0);
    let cum = 0;
    sentences.forEach((text, i) => {
      const start = sceneStart + Math.round((cum / totalWords) * audio);
      cum += words[i];
      const end = sceneStart + Math.round((cum / totalWords) * audio);
      entries.push({ text, start, end });
    });
    sceneStart += SCENE_DURATIONS[id] - CROSSFADE;
  }
  return entries;
}

const ENTRIES = buildEntries();

export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const active = ENTRIES.find((e) => frame >= e.start && frame < e.end);
  if (!active) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", zIndex: 50 }}>
      <div style={{ background: "rgba(6,6,14,0.7)", borderRadius: 10, padding: "12px 28px", marginBottom: 50, maxWidth: 1500, border: "1px solid rgba(107,107,245,0.18)" }}>
        <div style={{ fontFamily: INTER, fontSize: 30, fontWeight: 600, color: "#eef0f8", textAlign: "center", lineHeight: 1.4 }}>{active.text}</div>
      </div>
    </AbsoluteFill>
  );
};

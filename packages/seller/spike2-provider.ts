/**
 * Phase-2 Spike A — SELLER side.
 * Seeds Whisper (STT) and Supertonic (TTS) alongside the Phase-1 LLM, then opens
 * a QVAC provider. Proves (or disproves) that non-LLM modalities can be served
 * over a delegated session. Mirrors spike-provider.ts.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  startQVACProvider,
  downloadAsset,
  WHISPER_TINY,
  TTS_EN_SUPERTONIC_Q8_0,
} from "@qvac/sdk";

const KEY_FILE = ".spike/phase2-provider-key.txt";

const assets: Array<{ name: string; src: unknown }> = [
  { name: "whisper-tiny (STT)", src: WHISPER_TINY },
  { name: "supertonic-q8 (TTS)", src: TTS_EN_SUPERTONIC_Q8_0 },
];

for (const { name, src } of assets) {
  console.log(`⛏️  seller: downloading + seeding ${name}...`);
  let lastPct = -10;
  await downloadAsset({
    assetSrc: src as Parameters<typeof downloadAsset>[0]["assetSrc"],
    seed: true,
    onProgress: (p: { percentage: number }) => {
      if (p.percentage - lastPct >= 10) {
        lastPct = p.percentage;
        console.log(`   ${name} fetch ${p.percentage.toFixed(0)}%`);
      }
    },
  });
  console.log(`✅ seller: ${name} seeded.`);
}

const { publicKey } = await startQVACProvider({});
await mkdir(dirname(KEY_FILE), { recursive: true });
await writeFile(KEY_FILE, publicKey ?? "", "utf8");
console.log(`✅ seller: provider live.\n   🆔 ${publicKey}\n   (written to ${KEY_FILE})`);
console.log("📡 serving delegated STT/TTS... Ctrl+C to stop");

process.on("SIGINT", () => process.exit(0));
process.stdin.resume();

/**
 * Provider-side audio validation — the guard for tetherto/qvac#3221.
 *
 * A malformed f32le buffer that reaches the Whisper processing queue wedges
 * the model until the provider restarts (filed upstream as #3221). Until the
 * fix lands in the SDK, the provider rejects bad audio BEFORE it touches the
 * model: fail one request, keep the queue intact for every other client.
 *
 * Plain JS because it also runs inside the seller's Bare worker (no TS there).
 */

/**
 * Returns a human-readable reason to reject the audio chunk, or null if it is
 * acceptable. f32le audio must decode to a non-empty whole number of 32-bit
 * samples. Unknown formats and absent chunks are left for the SDK's own schema
 * validation — this guard only blocks what is known to wedge the model.
 */
export function f32leViolation(audioChunk, audioFormat) {
  if (audioFormat !== undefined && audioFormat !== "f32le") return null;
  if (!audioChunk || typeof audioChunk !== "object") return null;
  if (audioChunk.type !== "base64" || typeof audioChunk.value !== "string") return null;

  let bytes;
  try {
    bytes = Buffer.from(audioChunk.value, "base64").byteLength;
  } catch {
    return "audio chunk is not decodable base64";
  }
  if (bytes === 0) return "audio chunk is empty";
  if (bytes % 4 !== 0) return `audio chunk is ${bytes} bytes — not a whole number of f32le samples`;
  return null;
}

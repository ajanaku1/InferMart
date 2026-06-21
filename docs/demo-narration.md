# InferMart, 2-minute demo narration

Voiced for a screen recording. Left column is what you say; right column is what's on screen.
Target ~120 seconds. Do one warm-up request before you hit record so the DHT is already warm.

---

**[0:00, the problem]**
> Every time you ask a cloud model something, you're renting a stranger's datacenter, paying their markup, and handing over your prompt. Meanwhile the laptop next to you is sitting idle with a perfectly good model on it.
>
> InferMart lets that laptop sell its spare inference straight to you. No servers in the middle. You pay per token, in USDT, on-chain.

*Screen: the two dashboards side by side, buyer (left, :4801), seller (right, :4802). Seller says "live · serving P2P."*

---

**[0:18, the seller]**
> On the right is the seller. It's just a laptop running llama-3.2-1b. It opened a peer-to-peer endpoint over Holepunch and it's advertising a price. That's it, no cloud account, no cluster. One consumer device.

*Screen: hover the seller's provider key and "Earned · on-chain" tile (0.00 to start).*

---

**[0:32, the buyer asks]**
> On the left is the buyer. This machine has no model at all. I'll ask it something.

*Screen: type "In one sentence, what is peer-to-peer compute?" → click Send over P2P.*

> The prompt goes over the P2P link to the seller, runs on the seller's hardware, and the answer streams back token by token. That text is real inference happening on the other machine.

*Screen: tokens stream into the buyer's answer card.*

---

**[0:50, the money]**
> The moment it finishes, the buyer meters the work, 47 tokens, prices it, and sends real USDT to the seller. There's the tx hash. Click it, it's on Sepolia.

*Screen: buyer receipt shows "paid 0.000047 USDT" + tx link. Click it → Etherscan.*

> And watch the seller. Its balance just moved. That's not the buyer reporting a number, the seller is reading its own balance straight off the chain. The money actually moved.

*Screen: seller "Earned" tile ticks up; a new row appears in Recent jobs.*

---

**[1:12, the spend cap]**
> The buyer also set a spend cap for the session. Every request checks against it, and if a request would blow the budget, it never gets sent. Your wallet can't run away from you.

*Screen: point at the "Spent this session" meter and cap.*

---

**[1:24, the part cloud can't do]**
> Here's the part a cloud model can't match. I'm going to ask another question, and right as it's answering, I'll kill the internet.

*Screen: type a second prompt → Send → toggle Wi-Fi OFF mid-stream.*

> Wi-Fi's off. And it's still answering. The buyer and seller are talking over a local peer link, not the cloud. There's nothing to disconnect from.

*Screen: tokens keep streaming with Wi-Fi visibly off; the buyer's airplane card is right there.*

---

**[1:44, close]**
> So that's InferMart. Idle laptops selling AI to each other, peer to peer, settled in real stablecoin, working even when the internet doesn't. The compute is already out there. We just gave it a market.

*Screen: both dashboards, seller's job list filled in, buyer's session spend climbed.*

---

### Recording checklist
- Warm-up request done (DHT warm) before recording.
- Buyer funded, USDT deployed, `npm run demo` already running.
- Wi-Fi toggle reachable in one click for the airplane beat.
- Have the Etherscan tx tab ready in case the live click is slow.

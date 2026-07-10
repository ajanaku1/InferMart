# InferMart demo — voiceover script (PMF cut, ~140s)

Voice: Charon (informative, composed). Speed-up 1.12x after generation.

## hook
Right now, there are billions of laptops and phones powerful enough to run real AI models. Almost every single one of them is sitting completely idle.

## problem
So we rent the cloud instead. You pay a fat markup on someone else's GPU. Every prompt you send leaves your device. And the moment your connection drops, your AI is gone. One company, one bill, one point of failure.

## audience
This stings most if you care about privacy, if you're a builder watching inference costs eat your margin, or if you're somewhere the cloud is slow, pricey, or just not there. Demand for cheap, private inference is exploding. The supply is already sitting in people's hands.

## solution
InferMart connects the two. It's a peer-to-peer marketplace for inference. Anyone with a capable device becomes a seller, renting out spare compute. Anyone who needs an answer becomes a buyer, paying per token in stablecoin.

## howitworks
Three moves. A seller loads a model and opens a peer-to-peer endpoint over Holepunch. A buyer with no model sends a prompt straight to that peer. The work runs on the seller's hardware and streams right back. No servers in the middle.

## livebuyer
Here's a buyer with no model at all. I ask a question, it travels over the encrypted peer link, and the tokens come back one at a time. Real inference, running on a stranger's laptop, that never touched a datacenter.

## liveseller
On the other side, the seller just watches the work roll in. Idle hardware, now earning. Every finished request is a payment, settled on-chain, with no invoices and no middleman taking a cut.

## settlement
Each answer is metered by token and paid in real USDT. There's the transaction hash, live on Sepolia. The seller trusts the chain, not the buyer, reading its own balance as it climbs. And the buyer sets a hard spend cap, so a runaway bill simply can't happen.

## nocloud
Then the part no cloud model can match. Mid-answer, I cut the internet completely. And it keeps going. The two machines are talking over a local link. There is nothing left to disconnect.

## whynow
And this works now for a reason. Small models finally run well on everyday hardware. Stablecoins make a fraction-of-a-cent payment actually settle. Peer-to-peer networking grew up. Every idle device that joins makes inference cheaper, which pulls in more buyers, which pulls in more sellers.

## close
InferMart. Idle devices, selling AI to each other, settled in stablecoin, working even when the internet doesn't. The world's compute is already out there. We just gave it a market.

---
{
  "title": "So what actually is VDAC1, and why do I care this much?",
  "date": "2026-07-12",
  "tags": ["VDAC1", "mitochondria", "explainer", "VBIT"],
  "kind": "explainer",
  "readingTime": "6 min read",
  "image": "vdac1-barrel.svg",
  "viewer3d": true,
  "summary": "The on-ramp post: what the channel does, why 'the most abundant protein on the mitochondrial outer membrane' is a big deal, and how the same pore that keeps a cell alive can help kill it — with a spin-it-yourself 3D structure."
}
---
If you've landed here, you've probably seen me toss around "VDAC1" like everyone knows what it means. Let me fix that. This is the post I wish someone had handed me on day one.

## The one-sentence version
VDAC1 — the **voltage-dependent anion channel 1** — is a small protein that forms a pore in the outer membrane of your mitochondria, and it's basically the main doorway between the inside of the mitochondrion and the rest of the cell.

> Think of the mitochondrion as a walled power plant. VDAC1 is the front gate. Almost everything the plant ships out or takes in goes through that gate.

![Top-down illustration of the VDAC1 beta-barrel with its N-terminal helix inside](/assets/images/vdac1-barrel.svg "VDAC1 from the top: 19 β-strands rolled into a barrel, with the N-terminal α-helix (yellow) resting inside the pore.")

## Spin the real thing
That drawing is my cartoon of it. Here's the actual atoms — the crystal structure of human VDAC1 (PDB 2JK4). Drag to rotate, scroll to zoom. The yellow bit is that N-terminal helix that sits inside the barrel and helps gate it.

{{viewer3d}}

## What it does when everything's fine
Day to day, VDAC1 is a logistics protein — the most abundant one on the mitochondrial outer membrane. It handles the traffic of **metabolites** (ATP, ADP, NADH — your cell's whole energy economy leans on this), **ions** (especially calcium, which tunes how hard the mitochondria work), and **signals** (it's a physical docking point for proteins that decide the cell's fate).

## The plot twist: it also helps decide if the cell dies
Here's where it gets interesting, and where my obsession kicks in. VDAC1 isn't just a gate — it's a decision point for **apoptosis**, programmed cell death.

Under stress, VDAC1 molecules can **oligomerize** — clump together — and form a much bigger pore than any single channel would. That big pore is a problem, because it lets large things out that are never supposed to leave. **Cytochrome c** escapes and kicks off the apoptosis cascade. And **mitochondrial DNA (mtDNA)** escapes, which the immune system treats like an intruder — sensors like cGAS–STING read it as "we've been invaded" and trigger inflammation.

So the same protein that keeps the cell fueled can, when things go sideways, help the cell self-destruct *and* set off inflammation on the way out. That dual personality is exactly why VDAC1 keeps showing up in disease after disease.

## Why this matters for so many diseases
Once you see VDAC1 as "the gate that also throws the self-destruct switch," you start seeing it everywhere — cancer, autoimmune and inflammatory disease, metabolic, heart and kidney disease, and (my main interest) neurodegeneration, where energy-hungry neurons are especially exposed. Flip through the [news](/news/) and you'll notice how many of those beats VDAC1 turns up on.

## And that's why the drugs are interesting
If VDAC1 *oligomerization* is the bad event, then a drug that blocks the clumping without wrecking the normal gate could be genuinely useful. That's the whole idea behind the **VBIT** compounds (VBIT-4, VBIT-12), which I wrote about [over here](/posts/vbit-4-and-vbit-12/).

::: callout
**The takeaway:** VDAC1 is a tiny, abundant pore that runs your mitochondria's traffic — and under stress can gang up into a bigger pore that helps kill the cell and inflame its neighbours. Keep it working and closed-the-right-way, and a lot of downstream trouble might never start. That's the bet a lot of us are watching.
:::

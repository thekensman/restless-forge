A pen plotter draws a shape, lifts, moves, and draws the next one. The lift is
what makes multi-shape drawings possible.

A sand table ball cannot lift. It is held by a magnet under the bed, and it
ploughs a groove wherever it goes. Every move between shapes leaves exactly the
same mark as the shapes themselves.

Those marks are travel lines, and they are the single most common complaint
about converted sand patterns.

## Why they cannot be eliminated

The ball must be somewhere. To draw shape B after shape A it must physically
traverse the distance between them, through sand, leaving a groove.

There is no setting that removes them, in SandPath or anywhere else, because the
constraint is mechanical rather than algorithmic. What can be changed is how
*much* travelling happens and how visible it is. That turns out to be a
well-studied problem wearing a disguise.

## It is the travelling salesman problem

Given a set of shapes, each of which must be drawn, in what order should they be
visited to minimise the total distance travelled between them?

That is the travelling salesman problem, one of the classic NP-hard problems in
computer science. For a handful of shapes you could brute-force it. For an SVG
with two hundred subpaths, the number of possible orderings is larger than the
number of atoms in the observable universe, and the exact answer is not
available at any price.

So SandPath does what practically everyone does: it approximates.

## Nearest neighbour

The heuristic is simple to state. Start with the first path. When it ends, look
at every path not yet drawn and jump to whichever one starts closest to where
you are. Repeat until none are left.

It runs fast, it is easy to reason about, and it typically lands within
20–25% of optimal — a large improvement over document order, which is
effectively random with respect to position and is what you get if you do
nothing.

The characteristic weakness is the endgame. Nearest neighbour is greedy: it
always takes the closest option, which means it happily strands a few remote
paths that it must eventually cross the whole table to collect. If your pattern
has one or two very long travel lines while the rest are short, you are looking
at exactly that.

## Why not do better?

Better algorithms exist — 2-opt, Or-opt, Lin–Kernighan — and they meaningfully
improve on nearest neighbour. Two arguments against reaching for them here.

The first is diminishing returns. Total travel distance is not really what you
care about; *visible ugliness* is. Ten short travel lines scattered through a
dense design read as texture. One long one across an empty area reads as a
scar. Shaving 15% off total distance may not change how the pattern looks at
all.

The second is that source geometry dominates. A design drawn as eight
continuous strokes will beat the same design drawn as two hundred fragments
under any ordering algorithm, by a wide margin. Effort spent on the input pays
better than effort spent on the optimiser.

## Reducing them in practice

**Fewer, longer paths.** This is the whole game. In vector software, join
adjacent paths where you can. A single continuous outline is dramatically better
than the same outline chopped into segments.

**Watch the preview.** The preview shows travel moves. If it shows lines
slashing across empty space, the sand will too. This is the cheapest possible
feedback loop and it is worth using before every conversion.

**Prefer designs that are already connected.** Continuous-line art, single-stroke
lettering, and spiral-based designs convert beautifully because they were
already one path. Designs built from many isolated elements — a scatter of
stars, a field of dots — are inherently travel-heavy no matter what you do.

**Mind the trace mode.** Centerline typically produces fewer, longer paths than
Outline, which tends to yield many short edge fragments. If two modes both give
acceptable results, the one with fewer paths will have fewer travel lines.

**Let the sand help.** Travel lines are shallower than deliberate strokes at
some tables' speeds, and they genuinely recede once the whole pattern is down.
Judging a pattern at 40% complete is unfair to it.

## When to stop optimising

Every sand pattern has travel lines. Photographs of Sisyphus tables in
marketing materials have travel lines. Once you know to look for them you will
see them everywhere, which is a slightly unfortunate side effect of understanding
how the machine works.

They stop registering as defects once the pattern reads as a whole. The
reasonable goal is not zero travel lines — it is not having one long obvious
scar across an otherwise empty area. If the preview does not show that, the
pattern is fine.

Ready to try it? [Open the converter](/tools/sandpath/), or read
[how the conversion works](/tools/sandpath/how-it-works/).

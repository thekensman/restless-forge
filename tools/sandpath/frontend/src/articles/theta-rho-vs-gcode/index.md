Every kinetic sand table needs the same thing from a pattern file: an ordered
list of positions for the ball. Two formats dominate, and they disagree about
how to describe a position at all.

That disagreement is not arbitrary. It follows from how the machines are built,
and it has real consequences for whether a pattern you made today still works
after you buy a bigger table.

## Theta-rho: describing a circle in its own terms

Circular tables — the Grounded Oasis models, the Sisyphus range — move a ball on
a **polar** mechanism. One motor rotates an arm. Another moves a carriage along
that arm. There is no such thing as "left" in the machine's own frame of
reference; there is only *rotate* and *extend*.

Theta-rho matches that exactly. Each line is two numbers:

```
0.0000 0.0000
1.5708 0.5000
3.1416 1.0000
```

**Theta** is an angle in radians. **Rho** is a radius from 0 at the centre to 1
at the rim. Those three lines say: start at the centre, quarter-turn while
extending halfway, another quarter-turn while extending to the edge.

The crucial detail is that rho is **normalised**. It is not a measurement — it is
a fraction of whatever radius the table happens to have. That one decision gives
the format a property G-code cannot have.

## G-code: describing a rectangle in millimetres

Rectangular tables like the ZenXY use two perpendicular linear axes, which is
mechanically a small CNC machine. So they speak the language CNC machines have
spoken since the 1950s:

```
G21        ; millimetres
G90        ; absolute positioning
G0 X10 Y10 ; rapid move — reposition
G1 X90 Y40 ; linear move — draw
```

Only a handful of commands matter. `G21` and `G90` are declarations that appear
once. Then it is `G0` and `G1` all the way down.

The `G0`/`G1` distinction is worth dwelling on, because on a CNC router it is
meaningful — `G0` lifts the tool and moves fast. **On a sand table, nothing
lifts.** The ball ploughs its groove during a `G0` exactly as it does during a
`G1`. The distinction survives in the file format but the physical difference
does not, which is why travel moves are visible in the finished pattern.

## The portability difference

This is the practical consequence, and it catches people out.

**Theta-rho files are portable between circular tables.** Because rho is a
fraction rather than a measurement, the same file draws correctly on a 165 mm
Oasis Mini and a 622 mm Sisyphus Coffee Table. Upgrade your table and your
entire pattern library still works.

**G-code files are not portable.** `X90 Y40` means ninety millimetres and forty
millimetres. Load a file made for a 500 × 350 bed onto a 400 × 300 table and it
will drive into the wall. Change bed size, reconvert.

There is a caveat on the theta-rho side. Portable does not mean *identical* —
fine detail that reads clearly at 622 mm can fall below the ball's resolution at
165 mm. The geometry survives the move; the legibility might not.

## Two problems that only exist in polar

Converting Cartesian paths to theta-rho involves two subtleties that G-code
never encounters.

**Angle continuity.** Theta is not confined to one revolution. A table's arm
keeps rotating, so a pattern can legitimately wind through several turns. But
naive Cartesian-to-polar conversion returns an angle in the range −π to π, and a
path crossing that boundary produces a jump from +3.14 to −3.14. The machine
faithfully executes that as a full rotation backwards, which is a spectacular
and very visible defect. SandPath unwraps the angle across the boundary so the
sequence stays continuous.

**Density at the centre.** Near rho = 0, a large change in theta moves the ball
almost not at all; near rho = 1 the same change sweeps a long arc. Path detail is
therefore not uniform across the table in polar coordinates the way it is in
Cartesian ones — the centre gets crowded, the rim gets sparse.

## The rim margin

All of SandPath's circular profiles cap rho at **0.95** rather than 1.0.

That 5% is not conservatism for its own sake. At the very edge of a sand bed the
sand piles up, and the magnet's grip on the ball is at its weakest because the
carriage is fully extended. Patterns that run right to the rim are where balls
stall and lose the plot. Clipping to 0.95 leaves a working margin.

Rectangular profiles set the equivalent value to 1.0 because the concept does
not apply — bounds are the bed dimensions, and clipping happens against those.

## Which should you care about?

Mostly, you should not have to. Choose your table and SandPath emits the right
format with the right constraints.

The one moment it matters is when you are buying. If a pattern library you care
about matters to you, circular tables and theta-rho give you a collection that
survives an upgrade. That is a genuine, if minor, point in their favour — and
one nobody mentions in a product listing.

Ready to convert something? [Open the converter](/tools/sandpath/), or see
[which tables are supported](/tools/sandpath/supported-tables/).

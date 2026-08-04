A kinetic sand table is defined, as far as a pattern file is concerned, by three
things: whether the bed is round or rectangular, how big it is in millimetres,
and which file format the controller expects. SandPath ships a profile for each
supported table so you do not have to know any of that off the top of your head
— but if you are choosing a table, or building one, the details below are the
ones that matter.

## The profiles

| Table | Shape | Bed size | Output |
|---|---|---|---|
| Oasis Mini (Grounded) | Circular | 165 mm (6.5″) | `.thr` |
| Oasis One (Grounded) | Circular | 470 mm (18.5″) | `.thr` |
| Sisyphus Mini | Circular | 394 mm (15.5″) | `.thr` |
| Sisyphus End Table | Circular | 457 mm (18″) | `.thr` |
| Sisyphus Coffee Table | Circular | 622 mm (24.5″) | `.thr` |
| ZenXY (V1 Engineering) | Rectangular | 500 × 350 mm default | `.gcode` |
| Custom Circular | Circular | You specify | `.thr` |
| Custom Rectangular | Rectangular | You specify | `.gcode` |

## Circular tables and `.thr`

Every circular table here — both Oasis models and all three Sisyphus models —
takes **theta-rho** files. Each line holds an angle in radians and a radius
normalised from 0 at the centre to 1 at the rim.

Because rho is normalised, a `.thr` file is *resolution-independent*: the same
file draws correctly on a 165 mm Oasis Mini and a 622 mm Sisyphus Coffee Table,
just at different physical scales. This is genuinely useful — a pattern you like
transfers between tables without reconversion.

What does not transfer is fine detail. A 3 mm feature on a 622 mm table is
0.5% of the radius; the same fraction on a 165 mm Mini is under a millimetre,
far below what a ball roughly 10–15 mm across can physically carve. Detail that
looks crisp on the big table can disappear entirely on the small one.

All circular profiles cap out at a `max_rho` of **0.95** rather than 1.0.
That 5% margin keeps the ball clear of the rim, where sand piles up and the
magnet's pull is least reliable. SandPath clips your paths to that limit rather
than letting a design run off the edge.

## Rectangular tables and G-code

The **ZenXY** by V1 Engineering is the rectangular table in the lineup, and the
one you build yourself. It uses G-code — the same numerical-control language
CNC machines have used since the 1950s — with a deliberately small vocabulary:
`G21` to declare millimetres, `G90` for absolute positioning, `G0` for rapid
travel moves, and `G1` for draw moves.

The 500 × 350 mm default matches a common ZenXY build, but since it is an
open-source design with no fixed size, the profile is a starting point rather
than a specification. Enter your actual bed dimensions if yours differs.

Unlike `.thr`, G-code coordinates are absolute millimetres, so a G-code file is
**not** portable between differently-sized tables. Converting again for a
different bed is the correct move, not an inconvenience to work around.

## Custom tables

If your table is not listed — a homebuilt polar rig, a modified kit, a
commercial model SandPath does not yet profile — choose **Custom Circular** or
**Custom Rectangular** and enter the bed dimensions. The shape choice is what
determines the output format: circular gives you `.thr`, rectangular gives you
G-code.

Two things to measure before you type numbers in. Use the **sand bed** diameter
or dimensions, not the outside of the furniture; the enclosure is usually
several centimetres larger than the drawable area. And if your controller
expects a different rho ceiling than 0.95, convert with a slightly smaller bed
size to reproduce the same safety margin.

## Choosing a size

Larger tables are more forgiving of detail and more impressive in a room, but
they take proportionally longer to draw — a pattern that takes twenty minutes on
an Oasis Mini can run well over an hour on a Sisyphus Coffee Table, because the
ball is covering several times the distance at a similar speed.

If you are converting photographs or dense line art, the bigger beds genuinely
help. If you mostly want geometric patterns and spirals, a Mini renders them
just as cleanly.

Ready to convert something? Open the [converter](/tools/sandpath/), or read
[how the conversion works](/tools/sandpath/how-it-works/).

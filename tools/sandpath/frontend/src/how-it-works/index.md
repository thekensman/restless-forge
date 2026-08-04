Most image-to-sand-table converters take a shortcut: they turn a picture into
horizontal scanlines, the same way an inkjet printer lays down rows. That works
on paper because ink is opaque and rows blend into a solid tone. Sand does not
work that way. A steel ball dragging back and forth in parallel rows leaves a
visible corduroy texture, and the "image" only resolves if you stand far enough
away to stop seeing the rows.

SandPath is built the other way round. Everything is converted into **vector
paths** first — continuous strokes the ball can follow the way a hand follows a
pen — and only then translated into your table's coordinate system.

## SVG conversion

When you hand SandPath an SVG, it parses the real path data out of the markup
rather than rasterising the file and re-tracing it. That means it handles the
full set of standard path commands: straight line segments, quadratic and cubic
Bézier curves, elliptical arcs, and compound subpaths with multiple disconnected
contours.

Each curve is *sampled* into a sequence of points. This is the one place where
fidelity and file size trade off directly: sample too coarsely and a smooth arc
becomes a visible polygon; sample too finely and you get a file with tens of
thousands of coordinate pairs that takes a long time to draw. The Path Detail
control sets that sampling density.

Because an SVG's subpaths are stored in whatever order the authoring tool wrote
them, drawing them in document order usually means the ball jumps across the
table between shapes. SandPath reorders the paths using nearest-neighbour
sorting before output, so each stroke starts near where the previous one ended.

## Image tracing and vectorisation

Raster images — photographs, PNGs, screenshots — have no paths to extract, so
they go through a tracing stage first. Three modes are available, and choosing
the right one matters far more than any other setting.

**Outline** runs Sobel edge detection, which convolves the image with a pair of
gradient kernels to find where brightness changes sharply. The result is a
sketch: the boundaries and contours of a photograph without any filled areas.
This is the mode to reach for with photographs and detailed artwork.

**Threshold** applies a brightness cutoff to split the image into black and
white regions, then walks the boundary between those regions using marching
squares contour extraction. Because it produces closed, well-defined outlines,
it is the best choice for logos, silhouettes, lettering, and anything else with
genuinely high contrast.

**Centerline** skeletonises the image first — iteratively eroding shapes until
only a one-pixel-wide medial line remains — and traces that. For line drawings,
handwriting, and sketches this is the mode that behaves the way you expect: the
ball travels *along* each stroke rather than looping around both sides of it.

Whichever mode runs, the traced paths then go through Douglas–Peucker
simplification, which removes points that sit within a tolerance of the line
between their neighbours. It sheds most of the point count while leaving the
visible shape essentially unchanged.

## Turning paths into table coordinates

The final stage converts the vector paths into the format your table actually
reads, and it is where the two table families diverge.

Circular tables use **theta-rho**: each line is an angle and a normalised
radius. Cartesian points have to be converted to polar, and because theta is
continuous — the arm keeps rotating rather than snapping back to zero —
SandPath unwraps the angle across the ±π boundary so a path crossing that line
produces one smooth sweep instead of a full spurious rotation.

Rectangular tables use **G-code**, where the points stay Cartesian and are
emitted as `G0` rapid moves and `G1` draw moves in millimetres.

Both paths share the same safety step: coordinates are clipped to the table's
usable bed so the ball never drives into the rim. For circular tables that
limit is the profile's `max_rho`, which sits at 0.95 rather than 1.0 to leave a
margin at the edge.

## Why this produces better patterns

The practical upshot of vector-first conversion is that the ball spends most of
its time drawing and very little time travelling. Travel moves are the enemy of
a clean sand pattern: every jump between shapes leaves a straight scar across
work you already did. Path ordering minimises them, curve sampling keeps strokes
smooth, and clipping keeps the whole design inside the sand.

Ready to try it? Head back to the [converter](/tools/sandpath/), or read about
[which tables are supported](/tools/sandpath/supported-tables/).

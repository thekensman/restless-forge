A kinetic sand table is a simple machine doing something quietly hypnotic. A
steel ball sits in a bed of fine sand. Underneath, a magnet on a motorised arm
drags it around. The ball ploughs a groove wherever it goes, and because each
new pattern erases the last, the table is never finished — it just keeps
redrawing.

What the table needs from you is a path: an ordered list of coordinates telling
the magnet where to take the ball. That is all a pattern file is. SandPath's job
is turning a picture or a drawing into one.

## Converting your first pattern

1. **Pick your table** from the device list so the output matches what your
   controller expects. If yours is not listed, choose Custom Circular or Custom
   Rectangular and enter the bed size — see
   [supported tables](/tools/sandpath/supported-tables/).
2. **Drop in a file.** SVG works best. Raster images (JPG, PNG, WebP, BMP, GIF,
   TIFF) are also fine — they go through a tracing step first.
3. **Choose a trace mode** if you uploaded a raster image. Outline for
   photographs, Threshold for logos and high-contrast art, Centerline for line
   drawings and handwriting.
4. **Check the preview.** This is the step worth not skipping. The preview shows
   the actual path the ball will follow, including the travel moves between
   shapes.
5. **Adjust Path Detail** if needed. Coarser means smaller files and smoother
   curves; finer captures more detail at the cost of longer draw times.
6. **Download** and copy the file to your table however it normally accepts
   patterns.

Nothing is uploaded at any point — the conversion runs in your browser, and the
file never leaves your device.

## What is a theta-rho (.thr) file?

Theta-rho is a polar format, which sounds more intimidating than it is. Each
line has two numbers: **theta**, an angle in radians, and **rho**, a radius from
0 at the centre of the table to 1 at the edge.

```
0.0000 0.0000
0.0628 0.0100
0.1257 0.0200
```

Read those three lines and you have a ball starting at the centre and spiralling
gently outward. That is the whole format. Circular tables from Grounded (Oasis)
and Sisyphus Industries use it.

Because rho is a fraction of the radius rather than a measurement, the same file
works on any circular table regardless of size — one of the genuinely elegant
things about the format.

## What is G-code?

G-code is the language CNC machines have spoken since the 1950s, and rectangular
tables like the ZenXY use a small subset of it:

```
G21        ; units are millimetres
G90        ; absolute positioning
G0 X10 Y10 ; rapid move — reposition without drawing
G1 X90 Y40 ; linear move — draw to here
```

`G0` versus `G1` is the distinction that matters visually. `G0` is the ball
travelling to the start of the next shape; `G1` is the ball drawing. Every `G0`
in a sand table pattern still leaves a mark, which is why minimising them
matters so much.

Unlike theta-rho, G-code coordinates are absolute millimetres, so a file made
for one bed size will not fit another. Reconvert rather than rescale.

## Getting a good result

**Start with the right trace mode.** More patterns are ruined by tracing a
photograph in Threshold mode than by any other single mistake. Threshold wants
hard edges; photographs rarely have them.

**Respect the ball.** Detail smaller than the ball diameter — typically 10–15 mm
— cannot physically appear in the sand. Fine cross-hatching and small text will
turn into mush no matter how good the conversion is. When in doubt, simplify
the source image before converting rather than after.

**Prefer continuous strokes.** An SVG drawn as a handful of long paths produces
a far cleaner result than the same image drawn as hundreds of short disconnected
segments, because the ball spends less time travelling between them.

**Watch the travel lines in the preview.** If the preview shows straight lines
slashing across your design, that is what the sand will show too. Reducing the
number of separate shapes usually fixes it.

**Let it finish.** Patterns take time — anywhere from fifteen minutes to well
over an hour depending on bed size and path length. A pattern that looks wrong
halfway through often resolves completely once the remaining strokes land.

Ready? Open the [converter](/tools/sandpath/), or read
[how the conversion works](/tools/sandpath/how-it-works/).

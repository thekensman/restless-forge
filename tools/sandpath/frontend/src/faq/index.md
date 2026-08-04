## Do I need an account?

No. SandPath has no sign-up, no login, and no payment. Open it, convert a file,
download the result. There is nothing to register for because there is no server
holding anything to register against.

## Are my files uploaded anywhere?

No. Every stage — parsing SVG paths, tracing raster images, simplifying, and
generating `.thr` or G-code — runs in your browser in JavaScript. Your files
never leave your device. You can verify this the blunt way: load SandPath, turn
off your network connection, and convert something. It still works.

## What file types can I upload?

SVG vector files, and raster images in JPG, JPEG, PNG, WebP, BMP, GIF, and TIFF.

SVGs are converted directly from their path data, which is why they give the
cleanest results. Raster images go through a tracing stage first to produce
vector paths.

## Can I convert photographs?

Yes, with realistic expectations. Upload the image and SandPath will trace it
into vector paths, then convert those.

Use **Outline** mode for photographs — it finds edges and produces a sketch-like
interpretation. What you will not get is tone or shading: a sand table draws
lines, not greyscale. Photographs with a clear subject and uncluttered
background convert far better than busy scenes.

## Which trace mode should I use?

- **Outline** — photographs, detailed artwork, anything with soft gradients.
- **Threshold** — logos, silhouettes, lettering, high-contrast graphics.
- **Centerline** — line drawings, handwriting, sketches, where you want the ball
  to travel along each stroke rather than around it.

If a conversion looks wrong, changing the trace mode fixes it more often than
any other adjustment.

## My pattern has ugly straight lines across it. How do I fix that?

Those are travel lines — the ball moving between separate shapes. It cannot lift
off the sand, so every repositioning move leaves a mark.

SandPath already minimises them with nearest-neighbour path ordering. If they
are still prominent:

- Use source art with fewer disconnected shapes.
- For SVGs, join separate paths into continuous strokes where you can.
- Increase curve smoothness, which can merge nearby endpoints.
- Accept a few. Every sand pattern has some, and they fade from notice once the
  design reads.

## What does Path Detail actually change?

It controls how densely curves are sampled and how aggressively the traced
paths are simplified afterwards.

Coarser settings produce fewer points: smaller files, faster draws, smoother
curves, less fidelity. Finer settings keep more points: bigger files, longer
draws, more faithful detail — up to the point where the detail is finer than the
ball can carve, after which you are paying in draw time for nothing.

## Why does my fine detail disappear in the sand?

Because the ball has a physical width, usually 10–15 mm. Anything narrower than
that cannot be resolved — adjacent lines merge into a single trench. This is a
property of the machine, not of the conversion. Simplify the source image, or
draw it larger relative to the bed.

## Will a pattern made for one table work on another?

If both are circular, usually yes: `.thr` files use a radius normalised from 0
to 1, so they scale to any round bed. Fine detail may vanish on a smaller table.

If either is rectangular, no. G-code uses absolute millimetres, so a file made
for one bed size will not fit another. Reconvert for the new table.

## Can I use SandPath on my phone?

Yes. The interface is responsive and the file picker accepts files from your
device, so converting on a phone or tablet works the same way it does on a
desktop. Large images take longer to trace on mobile hardware, but they do
complete.

## Which tables are supported?

Oasis Mini and Oasis One, the Sisyphus Mini, End Table and Coffee Table, the
V1 Engineering ZenXY, plus custom circular and rectangular builds where you
enter your own bed dimensions. Full details on
[supported tables](/tools/sandpath/supported-tables/).

## Is SandPath free?

Yes, and there is no paid tier holding features back. The site carries
advertising to cover hosting. If you want to support it directly there are
donation links in the footer, but nothing about the tool changes either way.

# Tools

For maintainers only. Nothing in `tools/` or `test/` is needed on the server.

## re/: getting everything out of the original application

Needs Python 3 with Pillow, capstone and PyYAML, plus `unar`. Trap names come from the
multiversal Toolbox definitions (https://github.com/autc04/multiversal), which are free to
use because they came out of the clean-room Executor project.

    unar foobar-versus-the-dea.hqx                  # gives "Foobar Versus the DEA.rsrc" (AppleDouble)
    python3 -I tools/re/rsrc.py "Foobar Versus the DEA.rsrc" resource_fork.bin
    md5sum resource_fork.bin                        # 5eddfa81315e9373bc81caf797551cb6

Run the scripts with `-I` and keep the downloaded files in their own folder. Treat anything
that came out of an old archive as untrusted.

| Script | What it does |
|---|---|
| `rsrc.py` | pulls the resource fork out of the AppleDouble file and parses resource maps |
| `mac68k.py` | lays out the CODE segments with the A5 world and jump table, then disassembles every function by recursive descent (capstone) |
| `traps.py` | A-line trap names from multiversal |
| `faces.py` | finds every GetCIcon load and labels the A5 global that holds each sprite face |
| `show.py` | the reading tool, see below |
| `catalog.py` | lists every sprite setup routine with its task, hit proc, kind, code and faces |
| `globals.py` | lists globals the code only reads whose starting value is not zero (how the bomb cooldown turned up) |
| `redecode.py` | cicn colour icons to PNG (the files in `assets/sprites`) |
| `pict.py` | PICT v2 to PNG (the files in `assets/ui`) |
| `snd2wav.py` | uncompressed 8-bit snd resources to WAV (the files in `assets/sounds`) |
| `disasm.py` | the older pattern scan that first found the tile banks. Its level order was wrong; the loader table in `REVERSE_ENGINEERING.md` is right |

`show.py` reads `resource_fork.bin` and `multiversal/defs` from the current folder unless
`FOOBAR_RF` and `MULTIVERSAL_DEFS` say otherwise.

    python3 -I tools/re/show.py fc fn3_39CA         # main loop, score redraws folded away
    python3 -I tools/re/show.py f fn2_365E          # one routine in full
    python3 -I tools/re/show.py callers fn3_29D0    # who calls it
    python3 -I tools/re/show.py refs fn2_2142       # where its address is taken (hit procs)
    python3 -I tools/re/show.py g -5512             # every reader and writer of an A5 global (the score)

Function names are `fn<segment>_<offset>`, the same names `REVERSE_ENGINEERING.md` cites.

The decoders reproduce the shipped assets exactly: all 250 sprites pixel for pixel, all
nine WAV files byte for byte, and the PICTs that were checked.

    python3 -I tools/re/redecode.py resource_fork.bin out/sprites
    python3 -I tools/re/snd2wav.py resource_fork.bin out/sounds
    python3 -I tools/re/pict.py resource_fork.bin out/ui 141 166

The four arena images in `assets/ui` are PICTs stacked top to bottom: 142 to 145 for level 1,
131 to 134 for level 2, 147 to 150 for level 3, and 159, 160, 162, 163 for level 4.

## validate/: checking the port against footage

Needs numpy, Pillow, opencv-python and node.

1. Cut the playfield out of a capture at 4 frames a second. For the DVD capture (640 x 480):

       ffmpeg -ss 160 -i foobar-vs-the-dea_dvd.mp4 -vf "fps=4,crop=320:340:160:70" frames/f_%04d.png

2. Render the level 1 terrain and find the scroll position of every frame:

       python3 -I tools/validate/strip.py . 1 strip1.png
       python3 -I tools/validate/align.py strip1.png frames align.json 160 4

3. Find the submarine periscopes and compare them with where `js/sim.js` puts them:

       python3 -I tools/validate/subs.py . frames align.json subs.json

Results on the DVD are in `AUDIT.md`.

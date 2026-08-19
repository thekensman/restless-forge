A resume is two documents wearing one name. There is the thing a person looks
at — layout, hierarchy, typography — and the thing a machine extracts, which is
a flat stream of text with all of that thrown away.

Design for the second one first. The first one is easier to fix afterwards.

## What parsing actually does

When a resume reaches an applicant tracking system, something extracts text from
the PDF and tries to identify sections: contact details, experience, education,
skills. The extractor sees glyphs positioned on a page. It does not see your
intent.

That gap is where resumes get mangled, and the failure mode is quiet — you will
never be told your resume parsed badly. You will just not hear back.

## What survives, and what does not

**Survives reliably:** a single column of text, standard section headings,
ordinary dates, plain bullet points, common fonts.

**Frequently destroyed:**

- **Multi-column layouts.** A two-column design can extract as either column
  interleaved line by line, producing text that reads like two documents
  shuffled together. This is the single most damaging layout choice.
- **Text in headers and footers.** Some extractors skip them entirely. Putting
  your phone number in the header is a real way to become uncontactable.
- **Text inside images or icons.** Invisible. A skills section built from
  graphical rating bars conveys nothing at all.
- **Tables.** Sometimes fine, sometimes flattened into cell contents in an
  unpredictable order.
- **Creative section headings.** "Where I've Been" instead of "Experience" means
  the parser cannot classify the section. It may still capture the text, but
  loses the structure.

## Why ForgeResume builds text first

The tool produces a plain-text representation of your resume before it produces
a PDF, and the ATS score runs against that text rather than against the rendered
document.

That ordering is deliberate. Scoring the visual output would be scoring the
wrong artifact — what a screening system sees is the text stream, so that is
what should be measured. It also means the score does not change when you change
the styling, which is correct: styling does not change your keywords.

You can read the plain-text version. It is worth doing once, because it is
approximately what a machine sees, and it is often less complete than people
expect.

## Practical rules

**One column.** Whatever it costs you visually, it is worth it. Multi-column
resumes look designed and parse badly, and the parse happens first.

**Boring headings.** Experience. Education. Skills. Projects. This is a place
where distinctiveness has no upside.

**Contact details in the body**, at the top, as ordinary text — not in the page
header.

**Dates in a consistent, obvious format.** `Jan 2023 – Mar 2025` throughout.
Mixing formats makes date-range extraction unreliable, and date ranges are how
systems compute your years of experience.

**No text in graphics.** If a skill rating is a bar chart, the skill does not
exist as far as parsing is concerned.

**Standard fonts, embedded.** Exotic fonts can extract as garbage or as nothing.

**PDF, unless told otherwise.** It preserves layout and parses acceptably when
built properly. Send `.docx` when a posting explicitly asks for it — some older
systems genuinely handle it better.

## The part where this advice has limits

Plenty of people get hired with two-column resumes and unusual headings, because
plenty of hiring processes involve a human opening a file. In design fields, a
visually flat resume can actively work against you.

The honest framing is risk, not rule. Single-column, plainly-labelled resumes
have a much lower chance of failing badly at the parsing step. If you know your
resume is going straight to a person — a referral, a small company, a direct
email — that risk is close to zero and you can optimise for the reader instead.

When you do not know, and often you do not, the boring version is the safer bet.

## The order that works

1. Get the content right — what you did, what changed because you did it.
2. Check it as plain text. Read what a machine would read.
3. Run the [ATS keyword
   check](/tools/forgeresume/articles/what-an-ats-score-actually-measures/)
   against the specific posting and fix genuine omissions.
4. *Then* make it look good, within the constraints above.

Most people do this in reverse, spend their effort on step four, and never
discover that step two was broken.

Ready to try it? [Open ForgeResume](/tools/forgeresume/).

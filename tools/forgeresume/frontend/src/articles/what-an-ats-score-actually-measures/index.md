There is a large amount of advice online about "beating the ATS", most of it
written with more confidence than evidence. So it is worth being precise about
what ForgeResume's score is, because knowing its mechanism tells you exactly how
far to trust it.

## The mechanism, in full

1. Take the job description and tokenise it into words.
2. Drop stopwords — *the*, *and*, *with*, the connective tissue that appears in
   every document.
3. Drop tokens shorter than three characters, unless they contain a digit or a
   `+`/`#` — which is how `C#`, `Go`, and `C++` survive a filter that would
   otherwise delete them.
4. Count what remains and keep the 30 most frequent.
5. Tokenise your resume the same way.
6. Score = the percentage of those 30 keywords that appear anywhere in your
   resume.

That is the whole algorithm. Matched keywords are listed, missing ones are
listed, and the score is the ratio.

## What that makes it good for

**Catching genuine omissions.** You have used PostgreSQL for six years, the
posting says "PostgreSQL" four times, and your resume says "Postgres". A human
reader would not blink. A keyword matcher — and quite possibly a real screening
system — records a miss. That is a five-second fix and precisely the kind of
thing this catches.

**Revealing what the posting emphasises.** Frequency ranking is informative on
its own. If "stakeholder" appears six times and the technical skills appear once
each, the posting is telling you what the job is actually about, and that is
worth knowing before you write your cover letter.

**Prompting honest inventory.** A missing keyword is a question: do I actually
have this? Sometimes the answer is yes and you forgot to mention it. That is the
tool working.

## What it categorically does not measure

**Whether you are a good candidate.** It has no model of skill, seniority, or
fit. A resume stuffed with all 30 keywords in a footer scores 100% and is
worthless.

**Where the keyword appears.** "Led a team of eight engineers" and a skills-list
entry reading "leadership" score identically. Context is invisible to it.

**Synonyms and related concepts.** The matching is exact tokens. "React" does
not match "ReactJS". "Managed" does not match "management". This is a genuine
limitation, and it cuts both ways — it will report misses that a decent system
would have matched.

**What a specific employer's ATS does.** Real systems vary enormously. Some do
keyword matching close to this. Some do semantic matching. Many do almost
nothing automatic, and a human reads everything. Nobody outside the vendor knows
which you are facing.

## Why 30 keywords

It is a judgment call, and worth stating as one. Too few and the score swings
wildly on one word. Too many and you are matching against incidental vocabulary
from the company boilerplate at the bottom of the posting.

Thirty tends to capture the substantive requirements of a normal-length posting
before it starts dredging up "collaborative" and "fast-paced". It is not derived
from anything; it is a value that behaves sensibly across the postings I tested
it on.

## Using it without being used by it

**Treat missing keywords as questions, not instructions.** For each one: do I
genuinely have this experience? If yes, work it in naturally where it belongs.
If no, leave it out. A resume claiming skills you lack fails at the interview
stage, which is a worse place to fail.

**Do not chase 100%.** A perfect score means your resume has been reshaped to
mirror one posting's vocabulary, which usually reads badly to the human who
opens it next. Somewhere in the 60–80% range with the important terms present is
a better target than 95% achieved by contortion.

**Put keywords where they are true.** "Kubernetes" in a bullet describing what
you actually deployed is worth more than "Kubernetes" in a comma-separated skills
list, to both machines and people.

**Remember the human.** Even where an ATS filters first, a person reads what
survives. Optimising past the point of readability trades a real reader for a
hypothetical filter.

## The uncomfortable summary

Keyword matching is a crude proxy for relevance, and it is crude in ways that
disadvantage people who describe their work in their own words rather than in
the posting's.

The score is worth having because the *specific* failure it catches — a term you
genuinely own, phrased differently — is common, invisible, and trivially
fixable. Beyond that, it is measuring vocabulary overlap, and vocabulary overlap
is not the same thing as being right for the job.

Ready to try it? [Open ForgeResume](/tools/forgeresume/).

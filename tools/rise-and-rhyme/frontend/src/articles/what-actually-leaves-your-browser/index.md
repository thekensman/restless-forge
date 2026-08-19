Nearly everything on Restless Forge runs entirely in your browser. Rise & Rhyme
is one of the few exceptions, and exceptions deserve to be spelled out rather
than buried in a policy nobody reads.

It talks to a server because it has to: generating lyrics means calling a
language model, and doing that from the browser would mean shipping an API key
to every visitor. That is not a thing you can do safely. So there is a backend,
and this is exactly what it receives.

## What gets sent

One request per generation, in the evening before your alarm:

- **Your calendar's public iCal URL.** Fetched server-side to read tomorrow's
  events.
- **Your timezone.** So "tomorrow" means tomorrow where you are.
- **Your song preferences** — style and related settings.

That is the payload. There is no account, no email address, no device
identifier, and no login.

## What the server does with it

Fetches the iCal feed. Extracts the titles and times of the next day's events.
Sends those to the Anthropic Claude API to write lyrics. Returns the lyrics to
your browser, which caches them locally for the morning.

The event details are used to build the prompt and are not stored afterwards.
The generated lyrics live in your browser, not on the server.

## What is stored, and in what form

Rate limiting requires knowing whether a given URL or address has made requests
recently. That means keeping *something* — but not the thing itself.

Your iCal URL and IP address are stored **only as SHA-256 hashes**. A hash is a
one-way function: it is enough to recognise a repeat request, and it cannot be
reversed to recover the original. The raw values are never written down.

This matters more than it might sound for the calendar URL specifically. A
Google Calendar secret iCal address is a bearer credential — anyone holding it
can read that calendar. Storing it in plaintext would be creating a database
worth stealing. Storing a hash means a breach yields a list of hashes that
cannot be turned back into calendar access.

Both hashes are deleted automatically once their rate-limit window closes. The
database has pruning triggers rather than relying on a cleanup job someone
remembers to run — expired rate-limit rows, old generation records, and aged
statistics all age out on their own.

## What is never sent

- **Your calendar contents beyond tomorrow.** Only the next day's window is
  read.
- **Attendee details, locations, or descriptions.** Titles and times.
- **Anything at alarm time.** The morning playback is entirely local; the
  network is not involved.
- **Anything at all if you never generate.** No calendar URL, no requests.

## The honest residue

Two things are worth stating plainly rather than reassuring past.

**Your event titles reach Anthropic's API.** They are the raw material for the
lyrics — there is no version of this that generates a song about your day
without a model seeing your day. If tomorrow's calendar contains something you
would not want a third-party API to process, this tool is not the right fit for
that day, and you can skip generation.

**The server can see your calendar while it is fetching it.** It has to, in
order to read it. It does not retain it, but "does not retain" is a policy
promise about behaviour rather than an architectural impossibility — unlike the
browser-only tools, where the guarantee comes from there being no server at all.

That distinction is exactly why cloud-assisted tools carry a badge in the
directory and their own privacy page. The browser-only guarantee is stronger,
and blurring the two would be dishonest.

## Why the badge exists

Restless Forge's default is client-side, and the default is load-bearing — it is
most of why the tools can promise what they promise. A tool that quietly broke
that pattern would erode the promise for all of them.

So cloud-assisted tools are marked in the directory, described in the global
[privacy policy](/privacy), and carry their own page detailing their data flow.
The point is that "does this send my data anywhere" should be answerable at a
glance rather than by reading source code.

Full details: [Rise & Rhyme privacy](/tools/rise-and-rhyme/privacy/).

Ready to try it? [Open Rise & Rhyme](/tools/rise-and-rhyme/).

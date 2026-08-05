# About Rise & Rhyme

Wake up to a song about your day.

## What It Does

Rise & Rhyme turns tomorrow's calendar into a custom morning song. The evening
before your alarm, it reads your Google Calendar's public iCal feed, writes
rhyming lyrics about the day ahead — your meetings, appointments, and plans —
and records them as an actual song, sung, in a musical style matched to the
day's mood. At alarm time it plays, looping until you get up.

There's no account and no signup. Your calendar URL and preferences live in
your browser's localStorage, and the song is generated once per evening so
your alarm is ready before you wake.

## How It Works

1. Paste your Google Calendar "secret address in iCal format" and pick an
   alarm time.
2. The evening before each alarm day, your browser asks the Restless Forge
   server for a song. The server reads tomorrow's events from your calendar
   feed and writes lyrics with Claude, Anthropic's AI model.
3. Those lyrics go to a GPU running ACE-Step, an open-source music model,
   which sings them. The finished recording comes back to your browser, which
   holds onto it for the morning. This takes a minute or so, and the page
   stays usable while it happens.
4. If any of that fails, the alarm still rings: your browser reads the lyrics
   aloud over a backing track instead, and tells you it has done so. If even
   the lyrics never arrived, a fallback jingle wakes you up.

In this first version the tab needs to stay open overnight — there's no
background service or push notification yet.

## About Your Data

<div class="info-box">
<p><strong>Privacy:</strong> Rise &amp; Rhyme is a cloud-assisted tool. Your
calendar's iCal URL is sent to the Restless Forge server once per generation,
tomorrow's event titles and times are forwarded to the Anthropic Claude API to
write the lyrics, and those lyrics are forwarded to RunPod to be sung. Two
outside companies see a version of your day. The recording is held on our
server under a random filename and deleted within 36 hours; nothing else is
stored beyond short-lived, hashed rate-limiting records — see the
<a href="/tools/rise-and-rhyme/privacy/">Rise &amp; Rhyme privacy page</a> for
the full picture. Everything else (alarm, playback, preferences) stays in your
browser.</p>
</div>

See the [Rise & Rhyme privacy page](/tools/rise-and-rhyme/privacy/), the
site-wide [Privacy Policy](/privacy), and [Terms of Use](/terms).

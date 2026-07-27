# About Rise & Rhyme

Wake up to a song about your day.

## What It Does

Rise & Rhyme turns tomorrow's calendar into a custom morning song. The evening
before your alarm, it reads your Google Calendar's public iCal feed, writes
6–10 lines of rhyming lyrics about the day ahead — your meetings, appointments,
and plans — and picks an upbeat backing track to match the day's mood. At alarm
time, the song plays: an instrumental intro, your day sung over the music, and
a looping outro until you get up.

There's no account and no signup. Your calendar URL and preferences live in
your browser's localStorage, and the song is generated once per evening so
your alarm is ready before you wake.

## How It Works

1. Paste your Google Calendar "secret address in iCal format" and pick an
   alarm time.
2. The evening before each alarm day, your browser asks the Restless Forge
   server for a song. The server reads tomorrow's events from your calendar
   feed and writes lyrics with Claude, Anthropic's AI model.
3. The lyrics come back to your browser, which plays them over a locally
   stored backing track using your browser's speech synthesis — the audio
   itself never touches a server.
4. If generation ever fails, a fallback jingle still wakes you up.

In this first version the tab needs to stay open overnight — there's no
background service or push notification yet.

## About Your Data

<div class="info-box">
<p><strong>Privacy:</strong> Rise &amp; Rhyme is a cloud-assisted tool. Your
calendar's iCal URL is sent to the Restless Forge server once per generation,
and tomorrow's event titles and times are forwarded to the Anthropic Claude
API to write the lyrics. Nothing is stored beyond short-lived, hashed
rate-limiting records — see the <a href="/tools/rise-and-rhyme/privacy/">Rise
&amp; Rhyme privacy page</a> for the full picture. Everything else (alarm,
audio, preferences) stays in your browser.</p>
</div>

See the [Rise & Rhyme privacy page](/tools/rise-and-rhyme/privacy/), the
site-wide [Privacy Policy](/privacy), and [Terms of Use](/terms).

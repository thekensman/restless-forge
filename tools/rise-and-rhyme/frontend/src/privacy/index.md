# Rise & Rhyme Privacy

What leaves your browser, what doesn't, and what the server keeps.

## The Short Version

Rise & Rhyme is a **cloud-assisted** tool — unlike most Restless Forge tools,
one part of it runs on a server. Once per generation (normally the evening
before your alarm), your browser sends your Google Calendar public iCal URL to
the Restless Forge server. The server fetches that feed, extracts the next
day's event titles and times, and sends them to the **Anthropic Claude API**
to write your song's lyrics. The finished lyrics come back to your browser.
Everything else — the alarm, the music, the text-to-speech voice, and all of
your settings — runs entirely on your device.

## What Is Sent to the Server

- **Your iCal URL**, when a song is generated. The server uses it to fetch
  your calendar feed and rejects URLs that don't belong to known calendar
  providers.
- Nothing else. No account, no cookies, no analytics from this tool.

## What Is Sent to Anthropic

- **Tomorrow's event titles and times** from your calendar feed, formatted
  into a lyric-writing prompt for the Claude API. Anthropic processes this
  under its own [privacy policy](https://www.anthropic.com/legal/privacy).

## What the Server Keeps

- **A SHA-256 hash of your iCal URL** for rate limiting (one song per
  calendar every 12 hours). The raw URL is not retained after the generation
  completes.
- **Operational logs**: a timestamp, the hashed URL, the API cost, the chosen
  track and mood, and the event count — no event titles, no lyrics.
- Generated lyrics are returned to your browser and cached there; the server
  does not keep them beyond the request.

## What Never Leaves Your Browser

- Your alarm time, days, snooze, volume, voice, and music-style preferences
  (localStorage).
- The generated song cache used to play your alarm.
- All audio playback and speech synthesis.

## Your Calendar URL Is a Secret

A Google Calendar "secret address" grants read access to that calendar. Rise &
Rhyme stores it only in your browser's localStorage. You can revoke it at any
time from Google Calendar's settings ("Reset" next to the secret address),
which invalidates the old URL everywhere.

## Advertising

Restless Forge pages use Google AdSense; see the site-wide
[Privacy Policy](/privacy) for how ad cookies work and how to opt out.

## Contact

Questions about this policy: [GitHub Issues](https://github.com/thekensman/restless-forge/issues)
or the [contact page](/contact).

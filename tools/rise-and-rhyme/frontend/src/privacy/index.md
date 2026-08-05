# Rise & Rhyme Privacy

What leaves your browser, what doesn't, and what the server keeps.

## The Short Version

Rise & Rhyme is a **cloud-assisted** tool — unlike most Restless Forge tools,
one part of it runs on a server. Your browser sends your Google Calendar public
iCal URL to the Restless Forge server when a song is generated (normally the
evening before your alarm) and when you press **Check my calendar**. The server
fetches that feed and extracts the next day's event titles and times. To write
a song it sends those on to the **Anthropic Claude API**, and the lyrics come
back to your browser. Those lyrics then go to a second provider, **RunPod**,
which runs a GPU that records them as an actual sung song. A calendar check
stops before both of those steps. Everything else — the alarm, playback, and
all of your settings — runs entirely on your device.

Two outside companies are therefore involved in making a song: Anthropic sees
your event titles, and RunPod sees the lyrics written from them. If that is
more than you want to share, this is not the right tool for you, and the
browser-only tools elsewhere on the site have no server at all.

## What Is Sent to the Server

- **Your iCal URL**, when a song is generated or when you check your calendar.
  The server uses it to fetch your calendar feed and rejects URLs that don't
  belong to known calendar providers.
- **Your timezone** (for example `America/Chicago`), so the song covers the
  right calendar day and sings your events at the times you actually see.
- Nothing else. No account, no cookies, no analytics from this tool.

## What Is Sent to Anthropic

- **Tomorrow's event titles and times** from your calendar feed, formatted
  into a lyric-writing prompt for the Claude API. Anthropic processes this
  under its own [privacy policy](https://www.anthropic.com/legal/privacy).

## What Is Sent to RunPod

- **The finished lyrics**, plus a description of the musical style. RunPod
  runs the open-source ACE-Step model on a GPU and returns the recording.
  Because the lyrics are written from your calendar, they name your events —
  a line like "standup at nine with the crew" is your schedule in another
  form. Your iCal URL, your IP address, and the raw calendar feed are never
  sent. RunPod processes this under its own
  [privacy policy](https://www.runpod.io/legal/privacy-policy).

## The Recorded Song

The finished MP3 is stored on the Restless Forge server so your browser can
play it in the morning, under a random filename that is not derived from your
calendar in any way — nobody can guess or enumerate it. It is deleted
automatically within 36 hours, which covers the night it is made and the day
it is for. Nothing links a stored song back to the calendar it came from.

If song generation fails for any reason, the alarm falls back to the earlier
behaviour: the lyrics are read aloud by your browser's own text-to-speech over
a backing track, entirely on your device. Nothing extra is sent to make that
happen, and the tool tells you when it has fallen back.

## What the Server Keeps

This is the complete list — nothing else about you is written to disk.

- **A SHA-256 hash of your iCal URL** for rate limiting (one song per
  calendar every 12 hours). The raw URL is not retained after the generation
  completes. Deleted automatically once the 12 hours are up.
- **A SHA-256 hash of your IP address**, to limit how many songs one
  connection can request per hour, and a second hash for the same purpose on
  calendar checks. The address itself is never written to disk, and both
  hashes are deleted automatically after one hour.
- **Operational logs**: a timestamp, the hashed URL, the API cost, the chosen
  track and mood, and the event count — no event titles, no lyrics, no
  timezone. Kept for 30 days so an unexpected bill can be traced, then
  deleted automatically.
- **Daily totals** (number of songs and total API cost) so the service can
  stop itself before it runs up a bill.

Every one of those is removed by the database itself when it expires, so
nothing accumulates over time. Generated lyrics are returned to your browser
and cached there; the server does not keep them beyond the request.

## Checking Your Calendar

**Check my calendar** reads your feed and shows the events the song will cover,
along with the timezone it detected. It never calls the AI model, so nothing is
sent to Anthropic or RunPod and nothing is generated — it exists so you can
confirm the URL and timezone are right before a song is written.

## What Never Leaves Your Browser

- Your alarm time, days, snooze, volume, voice, and music-style preferences
  (localStorage).
- The cached lyrics used to play your alarm.
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

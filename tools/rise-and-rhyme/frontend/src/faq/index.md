# Rise & Rhyme FAQ

Answers to common questions about the AI morning song alarm.

## Where do I find my calendar's iCal URL?

In Google Calendar on the web: Settings → click your calendar under "Settings
for my calendars" → "Integrate calendar" → copy the **Secret address in iCal
format**. It's a long `https://calendar.google.com/calendar/ical/…/basic.ics`
URL. Treat it like a password — anyone with the URL can read that calendar.

## Do I need an account?

No. There's no signup and no login. Your iCal URL and alarm preferences are
stored in your browser's localStorage, on your device.

## Does my calendar data get uploaded?

The iCal URL is sent to the Restless Forge server once per generation (the
evening before your alarm). The server fetches the feed, extracts tomorrow's
event titles and times, and sends those to the Anthropic Claude API to write
the lyrics. Event details are not stored after the lyrics are generated — see
the [privacy page](/tools/rise-and-rhyme/privacy/) for exactly what's kept.

## Why does the tab need to stay open?

This first version schedules everything with in-page timers, so the browser
tab must stay open (and your device awake) for the alarm to fire. A version
that works through push notifications is on the roadmap.

## What happens if the song can't be generated?

You still get woken up. If the server is unreachable, busy, or rate-limited,
the alarm plays a built-in fallback jingle with a spoken wake-up line instead
of a custom song.

## Why is there a daily limit?

Each song costs real money to generate (the lyrics are written by the Claude
API). The server allows one song per calendar every 12 hours and caps total
daily generations, which keeps the tool free for everyone.

## Can I choose the music style?

Yes — pick a style in the settings (bright electronic, acoustic, funk, jazz,
indie pop, chiptune, or fanfare), or leave it on "Surprise me" and the mood
of your day picks the track.

## Is the source code available?

Yes. Code is on [GitHub](https://github.com/thekensman/restless-forge).

# Rise & Rhyme FAQ

Answers to common questions about the AI morning song alarm.

## Where do I find my calendar's iCal URL?

In Google Calendar on the web: Settings → click your calendar under "Settings
for my calendars" → "Integrate calendar" → copy the **Secret address in iCal
format**. It's a long `https://calendar.google.com/calendar/ical/…/basic.ics`
URL. Treat it like a password — anyone with the URL can read that calendar.

Don't use "Public URL to this calendar" or the embed code from that same panel:
those are links to a calendar *web page*, and Rise & Rhyme needs the feed. The
address you want ends in `.ics`. Outlook, iCloud, Yahoo, and Proton Calendar
feeds work too — look for "publish", "share", or "subscribe" in their settings.

## Do I need an account?

No. There's no signup and no login. Your iCal URL and alarm preferences are
stored in your browser's localStorage, on your device.

## Does my calendar data get uploaded?

The iCal URL is sent to the Restless Forge server when a song is generated (the
evening before your alarm) and when you press "Check my calendar". The server
fetches the feed and extracts tomorrow's event titles and times. When a song is
being written, those are sent on to the Anthropic Claude API for the lyrics,
and the lyrics are then sent to RunPod, which sings them on a GPU. Since the
lyrics describe your day, your events reach RunPod in that form. A calendar
check stops before both steps and contacts no one else. Event details are not
stored either way — see the
[privacy page](/tools/rise-and-rhyme/privacy/) for exactly what's kept.

## How do I check my calendar is set up right?

Press **Check my calendar** in the setup panel. It lists the events tomorrow's
song will cover and shows the timezone it detected, so you can confirm both
before a song is ever written. It doesn't call the AI, doesn't cost anything,
and doesn't use up your one song for the day — check as often as you like.

If the times look shifted, your browser is reporting a different timezone than
you expect; the song uses the same one shown there.

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

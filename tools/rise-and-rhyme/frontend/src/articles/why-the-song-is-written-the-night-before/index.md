The obvious design for a wake-up song that mentions your day is to generate it
when the alarm goes off. It is also the wrong one, and understanding why leads
to most of the interesting parts of how Rise & Rhyme is scheduled.

## The case against generating at wake-up

Generating a song means calling a language model, which takes seconds — sometimes
many of them. At 6:30am that translates to an alarm that rings and then makes
you wait, which defeats the purpose of an alarm.

Worse, it introduces failure at the least forgiving moment. If the network is
down, the API is slow, or your phone dropped its connection overnight, you get
nothing when you actually needed waking up.

So generation happens the evening before, at a time you choose. By the time the
alarm fires, the song is already sitting in your browser. Waking up involves no
network at all.

## Generation on day D covers the alarm on day D+1

That is the whole rule, and everything else follows from it.

The scheduler looks forward from now, day by day, for a day whose *following*
day has an alarm enabled. When it finds one, the generation slot is that
evening's chosen time, and the song it produces is for the next morning.

This handles the case people forget: a Monday–Friday alarm schedule needs a
*Sunday* evening generation. Sunday is not an alarm day, but Monday is, so
Sunday evening is a generation night. Reasoning about "which nights do I
generate" directly gets this wrong surprisingly often; deriving it from "which
mornings does the alarm ring" gets it right for free.

The search window is eight days, which covers any weekly pattern including one
with a single enabled day.

## The off-by-two bug worth documenting

There is a distinction in the code that exists because getting it wrong produced
a genuinely confusing symptom, and it is a nice illustration of a subtle
scheduling trap.

The preview needs to answer: *which day is the next song about?* The tempting
implementation is to ask the next generation slot what day it targets.

That breaks the moment tonight's generation time passes. Say generation is set
for 22:00. At 22:19, tonight's slot is in the past, so "the next generation
slot" is *tomorrow* night — which targets the day after tomorrow. The preview
then cheerfully showed a day two days out, while the song sitting in your
browser was for tomorrow morning.

The fix is to ask a different question. The song is *for* an alarm, so the day
it covers is the day of the next alarm — not the target of the next generation.
That answer is correct before the generation time, after it, and at 3am, when
the song already written is for later that same morning rather than tomorrow.

The general lesson: when two clocks are involved, derive from the one the user
cares about. Nobody cares when the API call happens. They care when the alarm
rings.

## Everything is local time

Alarms are a local-time concept. Nobody sets a 7am alarm meaning 7am UTC.

So dates are computed as local calendar dates rather than by slicing an ISO
string, which would silently shift the day for anyone west of Greenwich. Day
arithmetic uses date methods rather than adding 86,400,000 milliseconds, so
daylight-saving transitions are handled by the calendar. On the night the clocks
change, one day is 23 or 25 hours long, and millisecond arithmetic lands an hour
off — enough to move a 23:30 generation slot across midnight and onto the wrong
day.

The timezone is also sent to the backend, so the calendar events pulled for
"tomorrow" are tomorrow where you are.

## The grace window

Browser tabs get throttled. Backgrounded tabs get suspended. A laptop closed at
21:45 with generation set for 22:00 is not running any timers at 22:00.

So due-ness is a window rather than an instant: an occurrence counts as due if
its time has passed and it passed within the last 30 minutes. A tab that wakes
up at 22:12 still acts on the 22:00 slot instead of silently skipping the night.

Paired with that is a per-occurrence marker key — the local date plus the
hour and minute — recorded once an occurrence has been handled. The window makes
a late tab still fire; the marker makes sure it fires exactly once. Without the
marker, a tab waking repeatedly inside the window would generate several times;
without the window, a sleeping laptop means no song.

## What this means in practice

- **Set generation for an evening time you are usually online.** It needs the
  browser open to make the call. 9pm beats 3am.
- **Songs are ready before you sleep, not when you wake.** Whatever is in the
  browser at alarm time is what plays.
- **Changing tomorrow's calendar after generation does not change the song.**
  It was written from the calendar as it stood.
- **The alarm itself is fully offline.** Once the song exists, waking up needs
  nothing from the network.

Ready to try it? [Open Rise & Rhyme](/tools/rise-and-rhyme/).

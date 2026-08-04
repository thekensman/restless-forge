There is a tidy argument that goes like this: your real hourly wage is $40. A
painter charges $35 an hour. Therefore you should always hire the painter and
work an extra hour instead.

It is clean, it is internally consistent, and if you actually live by it you
will make some obviously wrong decisions.

## Where the tidy argument breaks

The logic assumes two things that are usually false.

**That you can convert time into money at will.** Most people cannot. Salaried
workers do not get paid more for the hour they freed up by hiring a painter.
The hour does not become $40 — it becomes an hour, which you will spend on
something else entirely.

**That all hours are interchangeable.** An hour of work you enjoy and an hour of
work you dread are not the same commodity, and no model that treats them
identically is describing human beings.

The second point is the one the calculator tries to take seriously.

## The multiplier

The decision engine adjusts the cost of your time by how you feel about the
task:

| Feeling about the task | Multiplier |
|---|---|
| Actively avoid it | 1.5 |
| Dislike it | 1.2 |
| Neutral | 1.0 |
| Enjoy it | 0.7 |
| Love it | 0.3 |

Your DIY time cost is multiplied by that number before being compared against
the cost of hiring. A task you dread effectively costs you 50% more time than
the clock says. A task you love costs you less than a third.

So at a $40 real hourly wage, a four-hour job you dread has an adjusted time
cost of $240, and paying someone $200 is the better deal. The same four hours
doing something you love costs $48 — and paying $200 to have it taken away from
you would be a poor trade.

## Why this is a heuristic, and why that is fine

Those five numbers are not derived from anything. There is no study establishing
that dread costs exactly 1.5×. I picked values that produce sensible
recommendations across a realistic range of inputs, and the honest description
is: **it is a fudge factor, deliberately.**

The alternative is not a more rigorous model. The alternative is pretending the
factor does not exist and quietly using 1.0 for everything — which is also an
unjustified assumption, just an invisible one that happens to be wrong.

An explicit fudge factor you can see and argue with beats an implicit one you
cannot.

## What the numbers are meant to capture

**Above 1.0 — dread.** Tasks you avoid do not only cost the hours they take.
They cost the procrastination beforehand, the low-grade weight of an
unfinished job, and the fact that dreaded tasks reliably take longer than
planned because you keep stopping.

**Below 1.0 — genuine enjoyment.** If you would spend Saturday morning doing
this anyway, the time is not really a cost. Calling it one produces the absurd
recommendation to pay someone to take away your hobby.

The 0.3 for "love" is deliberately aggressive. It exists to stop the model from
telling a keen gardener to hire a gardener, which is technically defensible
arithmetic and obviously wrong advice.

## How to use it honestly

**Rate the task, not the outcome.** Nearly everyone likes having a painted room.
The question is whether you like the painting.

**Be careful with "neutral."** It is the default and the least informative
answer. Most tasks are not truly neutral — you would rather do them than not, or
rather not than do. Pushing yourself to pick a side usually produces a better
recommendation.

**Watch for the flip.** The most useful thing about the multiplier is how often
it reverses the naive answer. When it does, that is worth a second of thought:
the arithmetic and your preferences are disagreeing, and the multiplier is the
model's attempt to let your preferences win.

**Distrust it at the extremes.** For a task you love that would take eighty
hours, a 0.3 multiplier will happily recommend DIY. Enjoyment does not scale
linearly with duration — hour sixty of anything is not hour two. The model does
not know that. You do.

## What it is really for

The multiplier is not there to produce a precise answer. It is there to stop the
tool from producing a confidently wrong one.

A calculator that says "hire out everything below your hourly rate" is
optimising a number that was never the actual objective. What people are
actually trying to do is spend their finite time on things worth spending it on
— and sometimes that means paying someone $200 to make a task disappear, and
sometimes it means keeping the task because doing it is part of the point.

Ready to try it?
[Open the calculator](/tools/what-is-my-time-worth/) and use the decision
engine.

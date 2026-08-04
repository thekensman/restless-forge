"Net 30" appears on an enormous number of invoices, and a surprising share of
the people writing it could not say precisely what it obligates. It is worth
thirty seconds of clarity, because the terms line is the part of an invoice that
determines when you actually get paid.

## What the terms mean

| Term | Payment due |
|---|---|
| Due on receipt | Immediately |
| Net 15 | 15 days after the invoice date |
| Net 30 | 30 days after the invoice date |
| Net 60 | 60 days after the invoice date |
| Net 90 | 90 days after the invoice date |

Two details that trip people up.

**They are calendar days, not business days.** Net 30 issued on the 1st is due on
the 31st, weekends and holidays included. If the 31st is a Sunday, it is still
due on the Sunday — practically it lands Monday, but the term itself does not
grant that extension.

**They count from the invoice date, not the delivery date.** Finish work on the
3rd, invoice on the 17th, and a Net 30 clock starts on the 17th. This is why
invoicing promptly matters more than it feels like it should: two weeks of delay
in sending is two weeks added to getting paid, invisibly.

## "Due on receipt" is a request

It sounds like the strongest term and functions as the vaguest. It has no date
attached, so there is nothing concrete to be late against. A client's accounts
payable system, which runs on scheduled payment batches, will typically assign
its own terms anyway.

If you want to be paid quickly, a short dated term — Net 7 or Net 15 — is more
effective than "on receipt", because it produces a specific day that can be
missed.

## Choosing terms honestly

**Net 30 is the default expectation** for business clients in most industries.
Shorter is normal for individuals and small businesses; longer is common when
dealing with large organisations, sometimes as their non-negotiable standard.

**Longer terms are a loan.** Net 90 means financing that client's operations for
three months at your expense. That may be a reasonable price for the work, but
it should be a decision rather than something you accepted because it was on
their portal.

**Shorter terms need to be set before the work.** Putting Net 7 on an invoice to
a client who has processed everything at Net 30 for two years will not change
when you get paid; it will just make the invoice look wrong to their system.

## How the due date is computed

ForgeInvoice takes the invoice date, adds the term's day count, and produces the
due date. Two small implementation notes with real consequences:

The date is parsed at midnight local time rather than as a bare date string.
Parsing `2026-08-04` directly in JavaScript treats it as UTC midnight, which for
anyone west of Greenwich renders as the 3rd. Anchoring it to local midnight
avoids invoices that appear to be dated a day earlier than you entered.

Adding days uses date arithmetic rather than a fixed number of milliseconds, so
month lengths and daylight-saving transitions are handled by the calendar rather
than by assuming every day is exactly 86,400 seconds. Net 30 from the 31st of
January lands on the 2nd of March in a non-leap year, which is correct and is
not what naive millisecond arithmetic produces around a DST boundary.

## Sequential invoice numbers

Invoice numbers increment by finding the trailing digits and adding one, while
preserving the prefix and the zero-padding. `INV-001` becomes `INV-002`;
`2026-014` becomes `2026-015`.

The padding preservation is the part that matters over time. Naive incrementing
turns `INV-009` into `INV-10`, which sorts wrongly in every file browser and
spreadsheet you will ever open. Keeping the width means your invoices stay in
order for as long as the padding lasts.

Sequential numbering is not just tidiness — most tax authorities expect invoice
numbers to be sequential and gapless, precisely so that missing invoices are
visible.

## Getting paid, beyond the terms line

The terms are necessary and not sufficient. What actually moves payment dates
earlier:

- **Invoice immediately.** The clock starts when you send.
- **Send to the right person.** Accounts payable, not your day-to-day contact,
  unless they have told you otherwise.
- **Put the PO number on it** if the client uses them. An invoice without one
  can sit in a queue indefinitely without anyone considering it late.
- **Make the total unambiguous.** This is where the [rounding
  work](/tools/forgeinvoice/articles/where-invoice-rounding-goes-wrong/) pays
  off — an invoice whose lines visibly sum to its total does not generate a
  query, and a query resets your payment timeline.

Ready to try it? [Open ForgeInvoice](/tools/forgeinvoice/).

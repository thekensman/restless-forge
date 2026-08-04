An invoice that is off by one cent is a small problem with an outsized cost. The
client notices, their bookkeeper queries it, and you spend twenty minutes
explaining floating-point arithmetic to someone who reasonably expected the
number to just be right.

Almost every version of this bug comes from rounding at the wrong moment.

## The floating-point part

Computers store `0.1` and `0.2` as binary fractions that cannot represent those
decimals exactly. The classic demonstration:

```
0.1 + 0.2 === 0.30000000000000004
```

For an invoice this shows up the moment quantities and prices are anything other
than round numbers. Three items at $19.99 is $59.97 in your head and
`59.969999999999999` to the machine. Display that raw and it looks broken;
display it rounded and the underlying value is still slightly off, ready to
compound at the next step.

## Rounding late is the trap

The instinct is to keep full precision through the whole calculation and round
once at the end. That feels more accurate. It produces invoices nobody can
verify.

Consider three line items, each 3 units at $9.995:

- Round only at the end: each line displays as `$29.99` (rounded for display),
  the sum shown is `$89.96` — because the true total is 89.955, which rounds up.
- Add the displayed lines: 29.99 × 3 = `$89.97`.

Your invoice now shows three lines that visibly add to 89.97 next to a total
saying 89.96. Both numbers are defensible. Neither is checkable by a human, and
the human is the one paying you.

## Rounding at every step

ForgeInvoice rounds to two decimals at **each** stage rather than once at the
end:

1. **Line amount** — quantity × unit price, rounded.
2. **Subtotal** — sum of the already-rounded line amounts, rounded.
3. **Discount** — computed from the subtotal, rounded, and capped so it can
   never exceed the subtotal.
4. **Taxable** — subtotal minus discount, rounded.
5. **Tax** — taxable × rate, rounded.
6. **Total** — taxable plus tax, rounded.

The result is an invoice where every number a reader can see adds up to every
other number they can see. That property matters more than being a fraction of a
cent closer to a theoretical ideal, because an invoice is a document people
check by hand.

## Discount before tax, not after

The order of steps 3–5 is a real decision, not an implementation detail.

Applying the discount **before** tax means tax is charged on what the customer
actually pays. Applying it after means charging tax on the pre-discount amount
and then discounting the total — which collects more tax than was actually due
on the transaction.

Discount-before-tax is the standard treatment in most jurisdictions and the more
defensible one. It is also the one that matches what a customer expects when
they see a discount line above a tax line.

## The cap that prevents nonsense

Discounts are clamped so they cannot exceed the subtotal. Without that,
entering a $500 fixed discount on a $300 invoice yields a negative taxable
amount, negative tax, and a negative total — an invoice that owes the client
money.

That is a data-entry mistake rather than a calculation one, but the calculator
should not faithfully compute an absurd result from it.

## Percentages versus fixed amounts

Percentage discounts are computed against the subtotal, so they scale as line
items change. Fixed discounts do not.

The practical difference shows up when you edit an invoice after building it.
Add a line item to an invoice with a 10% discount and the discount grows with
it. Add one to an invoice with a $50 fixed discount and the effective percentage
quietly shrinks. Neither is wrong; they just behave differently under edits, and
it is worth knowing which you chose.

## What this does not cover

**Multiple tax rates.** ForgeInvoice applies one rate to the whole invoice.
Jurisdictions where different line items attract different rates need
per-line-item tax, which this does not do.

**Tax-inclusive pricing.** Some regions quote prices with tax already included
and back it out for the invoice. This calculates tax on top of the entered
prices.

**Currency conversion.** Pick a currency and everything is in it. There is no
exchange-rate handling.

If your situation needs any of those, use proper accounting software. This is
built for the freelancer sending a handful of straightforward invoices a month,
and it tries to be exactly right for that case rather than approximately right
for every case.

Ready to try it? [Open ForgeInvoice](/tools/forgeinvoice/).

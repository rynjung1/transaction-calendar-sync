# App Store Guideline 5.1.1(ix) — research findings

Researched directly against Apple's current published guidelines, not from memory. This is informational research, not legal advice — the business-structure decision is yours to make, possibly with a lawyer/accountant given the real cost and liability implications.

## The exact guideline text

**5.1.1(ix)**, verbatim from [Apple's App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):

> "Apps that provide services in highly regulated fields (such as banking and financial services, healthcare, gambling, legal cannabis use, air travel and crypto exchanges) or that require sensitive user information should be submitted by a legal entity that provides the services, and not by an individual developer."

There's also a related, separate guideline that turned up in research and is worth knowing about even though it fits this app less directly:

**3.2.1(viii)**:

> "Apps used for financial trading, investing, or money management should be submitted by the financial institution performing such services and must have necessary licensing and permissions in the locations where you make them available."

## Does this app trigger it?

Two separate clauses in 5.1.1(ix) could each independently apply:

1. **"Provide services in... banking and financial services"** — this app doesn't provide banking/financial services itself; it's a read-only client of Plaid (which holds its own licensing as the data aggregator). This is the weaker of the two arguments for why the guideline applies, and is more squarely aimed at apps like trading platforms, lenders, or robo-advisors (matching 3.2.1(viii)'s wording almost exactly — "financial trading, investing, or money management").
2. **"...or that require sensitive user information"** — this is the clause that clearly applies. The app requires real bank login credentials (via Plaid) and handles real transaction/spending data. This clause is written to stand independently of the "financial services" clause, and there's no obvious argument that bank transaction data isn't "sensitive user information."

**Real precedent found**: an [Apple Developer Forums thread](https://developer.apple.com/forums/thread/118805) documents an actual case of an app being rejected under 5.1.1 specifically because it was submitted on an Individual account rather than an Organization account, involving financial data access. This isn't hypothetical — it's a documented rejection pattern for exactly this kind of app.

## The complication: what Apple actually tells sole proprietors to do

Apple's own enrollment guidance (via [developer.apple.com/help/account/membership](https://developer.apple.com/help/account/membership/D-U-N-S/) and related pages) says:

- Sole proprietors / single-person businesses should enroll as **Individual**, not Organization.
- A sole proprietorship having a D-U-N-S number does **not** automatically make it an Apple-accepted "legal entity" for Organization enrollment.
- Organization enrollment requires a D-U-N-S number and generally expects a registered legal entity (LLC, corporation, etc.) distinct from the individual.

This creates real tension: 5.1.1(ix) wants a "legal entity," but Apple's own sole-proprietor guidance says not to enroll as an Organization unless you actually have one. In practice, this means:

- A sole proprietorship likely **doesn't** satisfy what 5.1.1(ix) reviewers are looking for, since Apple treats it the same as an individual for enrollment purposes.
- A proper separate legal entity (incorporated business — in Canada, this would mean incorporating federally or provincially) is the thing that actually lets you enroll as an Organization and plausibly satisfies 5.1.1(ix).

## Practical paths forward

1. **Incorporate a business** (federal or Ontario/BC/etc. provincial incorporation, whichever applies to you) and re-enroll the Apple Developer Program as an Organization under that entity. This is the path that actually resolves the tension above, but has real cost (incorporation fees, possibly ongoing accounting/legal costs) and time (D-U-N-S number registration/verification can take 1–2 weeks if you don't already have one for the business).
2. **Submit as Individual anyway and see what happens.** Enforcement of 5.1.1(ix) isn't perfectly consistent — plenty of small indie personal-finance/budgeting apps using Plaid exist on the App Store under individual accounts. This is a real risk, not a guaranteed rejection, but the precedent above shows it's a real, documented failure mode specifically for Plaid-based apps. If rejected, Apple's guidance says you can convert an existing Individual account to Organization by contacting Developer Support rather than starting over.
3. **Provide strong Review Notes context** regardless of which path you take — describe plainly in App Store Connect's Review Notes that this is a personal read-only spending diary (not a financial institution, not investment/trading/lending), and attach/note that Plaid is the licensed data aggregator handling the actual bank connections, if that helps a reviewer's judgment call either way.

I'd lean toward option 2 first given you want to ship fast, with option 1 as the fallback if you get rejected — but this is your call given the real cost of incorporating versus the real risk of a rejection cycle costing you time instead.

## Sources
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/forums/thread/118805
- https://developer.apple.com/help/account/membership/D-U-N-S/
- https://developer.apple.com/help/account/membership/program-enrollment/

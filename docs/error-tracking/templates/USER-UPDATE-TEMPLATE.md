# User Update Messages — Aalishaan Studio

> Three ready-to-send messages. Claude Code fills the brackets from the incident; **the owner sends** (email or the site's usual channel). Tone rules: honest, brief, zero jargon, zero blame, thank them for telling you. A bug handled like this earns more trust than no bug at all.

---

## 1. "We're on it" — send within hours of a report (before the fix)

> Subject: We found the problem you hit
>
> Hi [Name],
>
> Thank you for telling us about [what they hit, in their words — e.g. "the error when paying for your order"]. You were right — [one plain sentence of what actually happened, e.g. "the page was failing for some customers after yesterday's update"].
>
> We're fixing it now and I'll confirm here the moment it's done. Nothing is wrong with your account and nothing on your side is needed.
>
> Thanks again for flagging it — it genuinely helps.
>
> [OWNER_NAME]

## 2. "Fixed" — send after the fix is verified live

> Subject: Fixed — and thank you
>
> Hi [Name],
>
> The problem you hit — [one plain sentence] — is fixed and verified. [If relevant: what they should do now, e.g. "The reset link in a fresh email will now work" / "Your confirmation email has now been sent."]
>
> We've also added a permanent automatic check for this exact issue, so it can't quietly come back.
>
> If anything still looks off, reply here and I'll look immediately.
>
> [OWNER_NAME]

## 3. Payment didn't go through — the "not a bug" helper

> Subject: About your payment on Aalishaan Studio
>
> Hi [Name],
>
> I checked on our side: your payment didn't complete because [the plain reason the Razorpay Dashboard shows — e.g. "your bank declined the payment" / "the bank's verification step wasn't completed"]. Nothing is wrong with the site or your account, and **you have not been charged**.
>
> Usually one of these solves it: try the card again, complete the bank's approval screen if it pops up, or use a different card. If it still won't go through, reply here and we'll sort it out together.
>
> [OWNER_NAME]

---

**Rules:** never send to anyone the incident didn't affect · never promise a date you haven't confirmed · never mention tools, logs, or internals ("Sentry", "webhook") — plain words only · for a Blocker that affected many users, send message 1 to all affected without waiting for them to report.

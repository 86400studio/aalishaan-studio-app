# Error Tracking Guide — How Problems Get Caught, Fixed, and Closed

Written for the owner. Your job in this system is never to read a log — you read plain English and make three decisions: how urgent, approve the fix, send the user message.

---

## 1. What Sentry is

A black-box recorder for the website. Claude Code installs it once (free account, one key). From then on, whenever an error happens to a real user — on any page, any device — Sentry records: **who** it was (their staff account email if they're logged in — customers are guests, D-PRE-03), **which page**, **which device and browser**, **what the error said**, and **their last few clicks** before it broke. Then it emails you.

What that means in practice: when a customer writes "the site broke when I tried to pay," you don't ask them twenty questions. Their answer is already recorded.

## 2. The two doors in

**Door A — Sentry finds it first (most cases).** You get an alert email, often before any user has noticed or bothered to complain. Forward it to Claude Code or say: *"/handle-error — new Sentry alert, here's the link."*

**Door B — a user reports it.** Someone emails or messages: payment failed, can't log in, something looks broken. You paste their message plus their email address: *"/handle-error — [user's email] reported this: [their message]."* Claude Code looks that user up in Sentry and the other logs and reconstructs what happened to them.

Either way, you get back **one plain paragraph**: what actually happened, who was affected (this one user / some users / everyone), whether it's a bug at all, and a proposed severity.

## 3. The lane — every incident, both doors, same five steps

1. **Understand.** Claude Code investigates and explains in plain words. If the logs show nothing, it reproduces the problem in a real browser before concluding anything. "Couldn't find the cause" is a status, never a conclusion.
2. **Decide severity.** This is the brake that keeps the system from exhausting you — not everything is a fire drill:

   | Severity | Means | You respond |
   |---|---|---|
   | **Blocker** | Money, login, or the whole site is affected | Fix **today**. If the site is truly down or losing data, `docs/ROLLBACK.md` first, fix second |
   | **High** | A real feature broken for some users | Fix sprint **this week** |
   | **Medium** | Annoying, but everything works | Post-launch backlog, next sprint |
   | **Low** | Cosmetic | Backlog |

3. **Fix.** A normal bug-fix sprint — branch → PR → Preview → review → merge. Nothing new to learn.
4. **A new test, always.** The fix isn't done until a test exists that reproduces this exact bug — it fails on the broken version, passes on the fixed one, and joins the launch-gate suite forever (and the morning check, if it's critical). This is the rule that makes the whole system compound: **the same bug can never quietly come back**, and every incident permanently strengthens the site.
5. **Tell the user, close the log.** Sentry shows exactly who was hit, so you message exactly those people using `templates/USER-UPDATE-TEMPLATE.md`. The incident's row in `docs/INCIDENT-LOG.md` cannot be marked Closed until "user informed" is ticked (or "n/a — caught before any user was affected" is recorded). The loop always ends with a human hearing from you — that's how a bug becomes a trust moment instead of a churn moment.

## 4. What Sentry can't see — and who covers it

Sentry catches things that **crash**. Some failures are silent: the email that never arrived, the button that did nothing, the form that "succeeded" into a void. Nothing crashed, so Sentry has nothing. That's why `/handle-error` also checks the **Razorpay Dashboard** (payments), the **Shiprocket panel** (shipments), the **transactional email provider's logs (D-06)** (deliveries), the **Vercel logs** (the server), and the **database logs** — and why the morning check (testing-setup) re-runs the critical journeys every day. Between them, both kinds of breakage are covered. You never need to know which log holds the answer; that's the skill's job.

## 5. "Payment failed" — read this before ever panicking

Most failed payments are **not bugs**. Cards get declined, banks block foreign or online charges, people abandon the bank-verification screen or close the Razorpay Checkout. All normal, all visible in the Razorpay Dashboard, none of it your site's fault. The skill will tell you plainly which case you're in:

- *"Her card was declined by her bank — not a bug. Suggest she retries or uses another card."* → send the payment-helper message from the user-update template. Done, logged, closed.
- *"The checkout itself is erroring for everyone — Blocker."* → the lane, at today-speed.

The distinction saves you from panicking over routine declines and from shrugging off real breakage.

## 6. Access denied — sometimes the system working

"I can't get in" is occasionally the security doing its job (not a staff member, MFA not completed, wrong account). The skill checks whether the denial was *correct* before treating it as a bug. If it's correct, the user message explains their actual status kindly — that's support, not a fix.

## 7. Privacy, in one paragraph

Sentry stores technical details plus the user's account identifier so you can help them — never passwords, never card numbers (card entry happens inside Razorpay Checkout; the site never receives them). Claude Code configures Sentry to scrub sensitive fields during setup. When you paste a user's report into `/handle-error`, their email is enough — never ask users for passwords, and never paste one anywhere.

## 8. Your weekly five minutes

Open `docs/INCIDENT-LOG.md`. Every row should be moving toward Closed, every Closed row has its new test and its "user informed ✓". Repeating patterns (three incidents on the same form) → ask Claude Code whether something deeper needs a sprint. That's the whole job.

---

Next step → `SETUP-CHECKLIST.md`. It ends with a deliberate test error, so the first alert you ever receive is one you were expecting.

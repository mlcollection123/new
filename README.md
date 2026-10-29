# lead-agent

Outbound prospecting agent. Each campaign has its own ICP and offer, stored in Postgres and editable at any time.

Flow: source (Apollo) -> score (Claude vs ICP) -> write (Claude) -> human approval -> send (SMTP) -> replies (IMAP, Claude triage) -> follow-ups.

## Run

    cp .env.example .env        # add keys, leave APOLLO_API_KEY empty for sample data
    docker compose up -d db
    npm install
    npm run agent db:init
    npm run agent campaign:create "VATcube" "VATcube: A to Z foreign VAT reclaim services" campaigns/vatcube.json
    npm run agent source 1
    npm run agent score 1
    npm run agent write 1
    npm run agent review 1
    npm run agent approve all 1
    npm run agent send 1            # dry run, prints emails
    npm run agent send 1 --live     # real sending, needs SMTP and SENDER_* in .env

Change targeting: edit the JSON, then `npm run agent campaign:icp 1 campaigns/vatcube.json`.

## Deploy

Any VPS with Docker (Namecheap VPS works). Shared hosting will not.

## Sending

- `send` is a dry run unless `--live`. Live mode refuses to start if SMTP, sender identity, postal address or UNSUB_SECRET is missing.
- Only approved messages send, highest score first, capped by DAILY_CAP per UTC day, with SEND_DELAY_MS between emails.
- Every email gets a footer with your identity, postal address and a signed unsubscribe link, plus List-Unsubscribe headers.
- Run `npm run agent serve` on a public URL (PUBLIC_URL, behind HTTPS) so unsubscribe links work. Suppressed addresses are never sourced or sent again.
- Run `send` from cron, for example once per morning. Raise DAILY_CAP slowly while the domain warms up.

## Replies and follow-ups

    npm run agent replies           # read inbox (last 14 days, read only), classify new replies
    npm run agent inbox 1           # replies that need you, with a suggested answer
    npm run agent handled <id>      # after you answered by hand
    npm run agent followups 1       # draft due follow-ups, then review, approve, send as usual

- Replies match a lead by the email thread headers, with the sender address as a fallback. Needs IMAP_HOST.
- unsubscribe, not_interested and bounce: address suppressed, lead closed, pending drafts cancelled.
- interested, not_now, objection, other: lead marked replied, follow-ups cancelled, suggested reply saved for you. The agent never answers replies on its own.
- out_of_office: logged, sequence continues.
- FOLLOWUP_DAYS=3,7 means two follow-ups, 3 days after the first email and 7 days after the second. The last one closes the loop politely.
- Follow-ups send in the same email thread. A lead that replied never gets another email, even if a follow-up was already approved.
- Cron suggestion: `replies` and `followups` every morning, then review, approve and `send --live`.

## Next
- LinkedIn: draft-only until you decide on the ban risk

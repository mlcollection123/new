# lead-agent

Outbound prospecting agent. Each campaign has its own ICP and offer, stored in Postgres and editable at any time.

Flow: source (Apollo) -> score (Claude vs ICP) -> write (Claude) -> human approval -> send (SMTP).

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

## Next
- Reply handling and classification
- Follow-up steps
- LinkedIn: draft-only until you decide on the ban risk

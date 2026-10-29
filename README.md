# lead-agent

Outbound prospecting agent. Each campaign has its own ICP and offer, stored in Postgres and editable at any time.

Flow: source (Apollo) -> score (Claude vs ICP) -> write (Claude) -> human approval -> send (not built yet).

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

Change targeting: edit the JSON, then `npm run agent campaign:icp 1 campaigns/vatcube.json`.

## Deploy

Any VPS with Docker (Namecheap VPS works). Shared hosting will not.

## Next

- Sender integration (Instantly/Smartlead or SMTP) with footer from SENDER_* env vars, unsubscribe link, daily caps
- Reply handling and classification
- Follow-up steps
- LinkedIn: draft-only until you decide on the ban risk

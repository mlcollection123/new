# VATcube Leads Generator

Outbound prospecting agent. Each campaign has its own targeting (segments with a pitch and pain point each), stored locally and editable at any time.

Flow: find leads (Apollo) -> score (Claude) -> write drafts (Claude) -> you review and approve -> send (SMTP) -> read replies (IMAP, Claude triage) -> follow-ups.
The agent never sends anything you have not approved and never answers replies on its own.

## Install (no coding)

Download `release/VATcube-Leads-Generator.zip`, unzip it, install Node.js LTS from nodejs.org, then on Windows run `Install-Windows.bat` once (installs to `%LOCALAPPDATA%\VATcube Leads Generator`, adds Desktop and Start Menu shortcuts), or on Mac and Linux run the launcher. Everything else happens in the browser. Full steps are in `README-FIRST.txt` inside the zip.

Needs Node 22.13 or newer. Data lives in `data/agent.db` (SQLite) and settings in `.env`, both next to the program.

## Develop

    npm install
    npm run typecheck
    npm run agent dashboard           # http://127.0.0.1:4000, same as the launcher
    npm run package                   # rebuilds release/VATcube-Leads-Generator.zip

CLI (same data as the dashboard): `campaign:create`, `campaign:icp`, `source`, `score`, `write`, `review`, `approve`, `send [--live]`, `replies`, `inbox`, `handled`, `followups`, `suppress`, `serve`. Run `npm run agent` for usage.

## Screens

Today (what needs you, one button per step), Outbox (approve, edit or reject each draft, keyboard driven), Conversations (replies with suggested answers), Leads, Campaign, Activity, Settings, Help. Light and dark. The visual design is adapted from Harvey (MIT), see `THIRD-PARTY-NOTICES.md`.

## Behaviour worth knowing

- `send` is a dry run unless `--live` (or the "Send for real" button). Live mode refuses to start if the mailbox, your name, company or postal address are missing.
- Daily cap (default 5) and a pause between emails (default 2 minutes) protect a new domain.
- Opt-out modes, set by `UNSUB_MODE`:
  - `reply` (default): footer asks people to reply "unsubscribe". A live send reads the inbox first and suppresses opt-outs. Needs IMAP.
  - `link`: signed unsubscribe URL with one-click header. Needs `serve` on a public HTTPS address, `PUBLIC_URL` and `UNSUB_SECRET`.
- Replies are matched to leads by email thread headers (sender address as fallback). unsubscribe, not_interested and bounce suppress the address and cancel pending drafts. interested, not_now, objection and other stop the sequence and wait in the Inbox with a suggested answer.
- `FOLLOWUP_DAYS=3,7` means two follow-ups, 3 days after the first email and 7 days after the second, sent in the same thread. A lead that replied never gets another email.
- The dashboard listens on localhost only and rejects requests for other host names. Writes need a per-session token. To expose it beyond your computer, set `DASHBOARD_HOST` and a `DASHBOARD_PASSWORD` (12+ characters) and put HTTPS in front.
- Apollo endpoint and field names should be checked against current Apollo docs before heavy use.

## Next

- LinkedIn: draft-only until the ban risk is decided
- Bounce and spam-complaint feedback from the mail server

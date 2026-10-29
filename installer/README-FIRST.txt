VATCUBE LEADS GENERATOR: setup in 5 minutes
================================

You do not need to write any code. Everything runs in your web browser.

1. INSTALL NODE.JS (one time)
   Go to https://nodejs.org and install the LTS version. Accept the defaults.

2. UNZIP THIS FOLDER
   Put it somewhere permanent, for example Documents. Do not run it from inside the zip.

3. INSTALL AND START
   Windows:  double-click Install-Windows.bat (once).
             It installs the agent, puts a "VATcube Leads Generator" shortcut on your Desktop and in the
             Start Menu, and starts it. From then on, open it from the shortcut.
             If Windows warns "protected your PC", click More info, then Run anyway.
             Prefer not to install? Double-click Start-Windows.bat to run it from this folder.
   Mac:      right-click Start-Mac.command, choose Open, then Open again.
   Linux:    run Start-Linux.sh
   Your browser opens the agent. A small window stays minimized in the taskbar while it runs.
   Close that window to stop the agent.

4. SETTINGS
   Paste your Anthropic key and your Apollo key (Apollo is optional to start).
   Fill in your name, company and postal address. They go in every email footer.
   Fill in your mailbox: address, SMTP server, username, password, and the IMAP server.
   Click Save, then "Test sending" and "Test reading replies".
   Open the test email in Gmail, choose "Show original", and check SPF, DKIM and DMARC all say PASS.
   If not, fix your domain's DNS before sending anything.

5. CAMPAIGN
   Open the Campaign page and create your campaign. Edit every "pitch" and "pain" line so it matches
   what you really sell. Emails can only be as good as these lines. Never claim results you cannot prove.

6. EVERY DAY
   The Today page shows what needs you and has a button for each step:
   Find leads, Score leads, Write drafts.
   Then open the Outbox: read each draft, edit if needed, and approve or reject.
   Keyboard: A approve, R reject, E edit, J and K to move.
   Back on Today: Send approved emails. Use "Dry run" first to see what would go out.
   Later: Check replies. Replies that need you appear in Conversations with a suggested answer.
   Draft follow-ups for leads who did not reply.
   "Pause all sending" on the Outbox page stops every real send until you resume.

SAFETY RULES
   - Send your first 3 emails to your own addresses (Gmail, Outlook, work) and check they reach the inbox, not spam.
   - Keep to 5 emails a day for the first 2 weeks, then raise slowly in Settings.
   - Read every draft until you trust the quality. The agent never answers replies by itself.
   - Anyone who replies "unsubscribe" is blocked automatically. Check replies before each send.
   - Do not email people in countries where you do not have a lawful basis. Ask a lawyer if unsure.

YOUR DATA
   Everything is in the "data" folder and the ".env" file next to this file.
   Back them up. Never share .env, it holds your passwords.

UPDATING
   Windows: unzip the new version and run Install-Windows.bat again. Your settings and data are kept.
   Mac and Linux: replace agent.cjs with the new one. Keep "data" and ".env".

WHERE THINGS ARE (Windows, after installing)
   %LOCALAPPDATA%\VATcube Leads Generator   (settings in .env, data in the data folder)

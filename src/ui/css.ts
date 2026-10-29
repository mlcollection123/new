// Visual design adapted from Harvey (MIT, Copyright (c) 2026 Ethan Rogers). See THIRD-PARTY-NOTICES.md.
export const CSS = `
:root{--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
--r-xs:4px;--r-sm:6px;--r-md:10px;--r-lg:14px;--sidebar-w:236px;
--bg:#F6F6F7;--surface:#fff;--surface-2:#F3F3F4;--surface-3:#EBEBED;--line:#E7E7EA;--line-strong:#D6D6DB;
--text:#111113;--text-2:#5B5B63;--text-3:#8B8B93;--accent:#1D4ED8;--accent-hover:#1E40AF;--accent-text:#fff;--accent-soft:#EBF1FE;--accent-line:#CCDBFC;--chart-muted:#BCD0FA;
--good:#1F7A4D;--good-bg:#E8F6EE;--good-line:#C6EAD5;--wait:#8A5A00;--wait-bg:#FFF4DE;--wait-line:#F6DFAE;
--bad:#B4232F;--bad-bg:#FDECEE;--bad-line:#F7CDD2;--active:#0E7490;--active-bg:#E5F6F9;--active-line:#BDE5EE;--note:#6A3FB0;--note-bg:#F2ECFC;--note-line:#DFD1F6;
--shadow:0 0 0 1px rgb(17 17 19/.06),0 1px 2px -1px rgb(17 17 19/.06),0 2px 4px 0 rgb(17 17 19/.04);
--btn-shadow:0 0 0 1px rgb(17 17 19/.10),0 1px 2px rgb(17 17 19/.06);--btn-primary-shadow:inset 0 1px 0 rgb(255 255 255/.18),0 0 0 1px #1A44C2,0 1px 2px rgb(17 17 19/.12);color-scheme:light}
:root[data-theme=dark]{--bg:#0E0E10;--surface:#161618;--surface-2:#1D1D20;--surface-3:#26262A;--line:#26262A;--line-strong:#34343A;
--text:#F3F3F5;--text-2:#A3A3AC;--text-3:#6E6E77;--accent:#3D6FF5;--accent-hover:#5A85FF;--accent-soft:#111C36;--accent-line:#1E3366;--chart-muted:#22365F;
--good:#5CCB8F;--good-bg:#10261B;--good-line:#1C4130;--wait:#F0B84F;--wait-bg:#2A2010;--wait-line:#4A3817;
--bad:#FF7A85;--bad-bg:#2C1316;--bad-line:#4C1F25;--active:#4CC3D9;--active-bg:#0C2328;--active-line:#164049;--note:#B79BF5;--note-bg:#1E1730;--note-line:#352857;
--shadow:0 0 0 1px rgb(255 255 255/.07);--btn-shadow:inset 0 1px 0 rgb(255 255 255/.06),0 0 0 1px rgb(255 255 255/.10);--btn-primary-shadow:inset 0 1px 0 rgb(255 255 255/.20),0 0 0 1px rgb(0 0 0/.4);color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0E0E10;--surface:#161618;--surface-2:#1D1D20;--surface-3:#26262A;--line:#26262A;--line-strong:#34343A;
--text:#F3F3F5;--text-2:#A3A3AC;--text-3:#6E6E77;--accent:#3D6FF5;--accent-hover:#5A85FF;--accent-soft:#111C36;--accent-line:#1E3366;--chart-muted:#22365F;
--good:#5CCB8F;--good-bg:#10261B;--good-line:#1C4130;--wait:#F0B84F;--wait-bg:#2A2010;--wait-line:#4A3817;
--bad:#FF7A85;--bad-bg:#2C1316;--bad-line:#4C1F25;--active:#4CC3D9;--active-bg:#0C2328;--active-line:#164049;--note:#B79BF5;--note-bg:#1E1730;--note-line:#352857;
--shadow:0 0 0 1px rgb(255 255 255/.07);--btn-shadow:inset 0 1px 0 rgb(255 255 255/.06),0 0 0 1px rgb(255 255 255/.10);--btn-primary-shadow:inset 0 1px 0 rgb(255 255 255/.20),0 0 0 1px rgb(0 0 0/.4);color-scheme:dark}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--sans);font-size:14px;line-height:1.5;background:var(--bg);color:var(--text);min-height:100dvh;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
a{color:inherit;text-underline-offset:2px;text-decoration-color:var(--line-strong)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:var(--r-xs)}
[hidden]{display:none!important}
.icon{width:16px;height:16px;flex:none}
.app{display:grid;grid-template-columns:var(--sidebar-w) minmax(0,1fr);min-height:100dvh}
.sidebar{position:sticky;top:0;height:100dvh;display:flex;flex-direction:column;padding:20px 12px 12px;background:var(--bg);border-right:1px solid var(--line);overflow-y:auto}
.brand{padding:0 10px 14px}.brand b{display:block;font-size:15px;letter-spacing:-.01em}.brand span{font-size:12px;color:var(--text-3)}
.side-select{margin:0 4px 6px}.side-select select{width:100%}
.nav-label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3);padding:16px 12px 6px}
.nav-item{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:var(--r-sm);color:var(--text-2);text-decoration:none;font-size:14px;margin-bottom:1px}
.nav-item .count{margin-left:auto;font-size:11px;font-weight:600;min-width:20px;text-align:center;padding:1px 6px;border-radius:99px;background:var(--accent-soft);color:var(--accent)}
.nav-item:hover{background:var(--surface-2);color:var(--text)}
.nav-item.on{background:var(--surface);color:var(--text);box-shadow:var(--shadow)}.nav-item.on .icon{color:var(--accent)}
.sidebar-foot{margin-top:auto;padding:12px 6px 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.dotline{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2)}
.dot{width:7px;height:7px;border-radius:50%;background:var(--good);flex:none}.dot.paused{background:var(--wait)}.dot.busy{background:var(--accent);animation:pulse 1.4s infinite}
@keyframes pulse{50%{opacity:.35}}
.content{padding:32px 36px 64px;max-width:1260px;width:100%}
.page-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:24px;flex-wrap:wrap}
.page-head h1{font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.2}.page-head p{color:var(--text-2);margin-top:4px;max-width:70ch}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.card{background:var(--surface);box-shadow:var(--shadow);border-radius:var(--r-lg);padding:20px;margin-bottom:16px}
.card.flush{padding:0;overflow:auto}.card h3{font-size:14px;font-weight:600;letter-spacing:-.01em}
.card-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}.meta{font-size:12px;color:var(--text-3)}.lede{color:var(--text-2);font-size:13px;margin:4px 0 12px}
.section-title{font-size:14px;font-weight:600;margin:24px 0 12px}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:8px}
.kpi{background:var(--surface);box-shadow:var(--shadow);border-radius:var(--r-lg);padding:16px 18px;display:flex;flex-direction:column;gap:6px}
.kpi-label{font-size:13px;color:var(--text-2)}.kpi-main{display:flex;justify-content:space-between;align-items:flex-end;min-height:34px}
.kpi-value{font-size:28px;font-weight:600;letter-spacing:-.03em;line-height:1.1}.kpi-value.zero{color:var(--text-3)}.kpi-note{font-size:12px;color:var(--text-3)}
.spark{width:84px;height:28px}.spark rect{fill:var(--accent)}.spark rect.zero{fill:var(--chart-muted)}
.need{display:flex;align-items:center;gap:14px;background:var(--surface);box-shadow:var(--shadow);border-radius:var(--r-lg);padding:16px 18px;margin-bottom:10px}
.need-icon{width:36px;height:36px;border-radius:var(--r-md);display:grid;place-items:center;flex:none}
.need-icon.wait{background:var(--wait-bg);color:var(--wait)}.need-icon.good{background:var(--good-bg);color:var(--good)}.need-icon.bad{background:var(--bad-bg);color:var(--bad)}.need-icon.note{background:var(--note-bg);color:var(--note)}
.need-body{flex:1;min-width:0}.need-body b{display:block;font-weight:600}.need-body span{color:var(--text-2);font-size:13px}
.stagebar{display:flex;height:8px;border-radius:99px;overflow:hidden;gap:2px;margin:4px 0 14px;background:var(--surface-3)}.stagebar i{display:block;height:100%}
.legend{list-style:none}.legend li{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}.legend li:last-child{border:0}
.legend .sw{width:8px;height:8px;border-radius:2px;flex:none}.legend .n{margin-left:auto;font-weight:500}.legend .pct{width:38px;text-align:right;color:var(--text-3);font-size:12px}
.btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:0;border-radius:var(--r-sm);font:inherit;font-size:13px;font-weight:500;background:var(--surface);color:var(--text);box-shadow:var(--btn-shadow);cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:active{scale:.97}.btn:disabled{opacity:.5;cursor:not-allowed}.btn.primary{background:var(--accent);color:var(--accent-text);box-shadow:var(--btn-primary-shadow)}.btn.primary:hover{background:var(--accent-hover)}
.btn.danger{color:var(--bad)}.btn.ghost{background:none;box-shadow:none;color:var(--text-2)}.btn.sm{height:28px;padding:0 10px;font-size:12px}
kbd{font:11px var(--mono);padding:0 5px;border-radius:var(--r-xs);box-shadow:0 0 0 1px var(--line-strong);color:var(--text-2);background:var(--surface);margin-left:6px}
.badge{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:99px;font-size:12px;font-weight:500;border:1px solid var(--line);background:var(--surface-2);color:var(--text-2);white-space:nowrap}
.badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.badge.good{background:var(--good-bg);color:var(--good);border-color:var(--good-line)}.badge.wait{background:var(--wait-bg);color:var(--wait);border-color:var(--wait-line)}
.badge.bad{background:var(--bad-bg);color:var(--bad);border-color:var(--bad-line)}.badge.active{background:var(--active-bg);color:var(--active);border-color:var(--active-line)}
.badge.note{background:var(--note-bg);color:var(--note);border-color:var(--note-line)}
.tag{font-size:12px;padding:1px 8px;border-radius:99px;background:var(--surface-2);color:var(--text-2);border:1px solid var(--line)}
.avatar{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;background:var(--surface-3);color:var(--text-2);flex:none}
.avatar.on{background:var(--accent);color:#fff}
.tabs{display:inline-flex;gap:2px;padding:3px;border-radius:var(--r-md);background:var(--surface);box-shadow:var(--shadow);margin-bottom:16px;flex-wrap:wrap}
.tabs a{padding:5px 12px;border-radius:var(--r-sm);text-decoration:none;color:var(--text-2);font-size:13px}.tabs a.on{background:var(--surface-3);color:var(--text)}.tabs a span{color:var(--text-3);margin-left:4px}
.outbox{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:start}
.ob-list{background:var(--surface);box-shadow:var(--shadow);border-radius:var(--r-lg);padding:8px;max-height:640px;overflow:auto}
.ob-item{display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:9px 10px;border:0;border-radius:var(--r-md);background:none;color:inherit;font:inherit;cursor:pointer}
.ob-item:hover{background:var(--surface-2)}.ob-item.on{background:var(--accent-soft)}
.ob-item b{display:block;font-weight:500;font-size:13px}.ob-item small{display:block;color:var(--text-3);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ob-pane{background:var(--surface);box-shadow:var(--shadow);border-radius:var(--r-lg);padding:24px}
.ob-to{display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:var(--text-2);margin-bottom:16px}.ob-to b{color:var(--text);font-weight:500}
.facts{display:grid;grid-template-columns:110px 1fr;gap:6px 16px;background:var(--surface-2);border-radius:var(--r-md);padding:16px 18px;margin-bottom:20px;font-size:13px}.facts dt{color:var(--text-3)}.facts dd{min-width:0;overflow-wrap:anywhere}
.ob-subject{font-size:18px;font-weight:600;letter-spacing:-.01em;margin-bottom:12px}.ob-text{white-space:pre-wrap;line-height:1.65;font-size:15px;max-width:68ch}
.ob-foot{display:flex;align-items:center;gap:8px;margin-top:24px;padding-top:16px;border-top:1px solid var(--line);flex-wrap:wrap}.ob-foot .pos{margin-left:auto;color:var(--text-3);font-size:12px}
input[type=text],input[type=number],input[type=password],select,textarea{width:100%;padding:8px 10px;border:0;border-radius:var(--r-sm);background:var(--surface);color:var(--text);font:inherit;box-shadow:0 0 0 1px var(--line-strong)}
select{width:auto}.side-select select{width:100%}
textarea{min-height:220px;resize:vertical;line-height:1.55}textarea.tall{min-height:420px;font:12.5px/1.5 var(--mono)}
label{display:block;margin-top:14px;margin-bottom:4px;font-weight:500;font-size:13px}label .meta{font-weight:400}
table{border-collapse:collapse;width:100%;font-size:13px}th{font-weight:500;color:var(--text-3);text-align:left;padding:10px 16px;border-bottom:1px solid var(--line)}td{padding:10px 16px;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}
.convo{background:var(--surface);box-shadow:var(--shadow);border-radius:var(--r-lg);padding:20px;margin-bottom:16px}
.convo-head{display:flex;gap:12px;align-items:center;margin-bottom:16px}.convo-head .who{flex:1;min-width:0}.convo-head b{font-weight:600}
.bubble{border-radius:var(--r-md);padding:12px 14px;margin-bottom:10px;max-width:86%;white-space:pre-wrap;font-size:13.5px;line-height:1.55}
.bubble.out{margin-left:auto;background:var(--surface-2)}.bubble.in{background:var(--accent-soft);border:1px solid var(--accent-line)}
.bubble small{display:block;color:var(--text-3);font-size:12px;margin-bottom:4px}
.suggest{border:1px dashed var(--line-strong);border-radius:var(--r-md);padding:12px 14px;margin-top:10px}.suggest pre{white-space:pre-wrap;font:inherit;margin:6px 0 10px}
.job pre{white-space:pre-wrap;font:12px/1.5 var(--mono);background:var(--surface-2);padding:12px;border-radius:var(--r-md);max-height:260px;overflow:auto;margin-top:10px}
.flash{background:var(--accent-soft);color:var(--text);border:1px solid var(--accent-line);border-radius:var(--r-md);padding:10px 14px;margin-bottom:16px}
.steps{display:grid;gap:0}.step{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.step:last-child{border:0}.step .t{flex:1;min-width:0}.step .t b{font-weight:500}.step .t span{display:block;color:var(--text-3);font-size:12px}
.step form{display:flex;gap:8px;align-items:center}.step input[type=number]{width:70px}
.check{display:flex;gap:10px;padding:6px 0;font-size:13px}.check .ok{color:var(--good)}.check .no{color:var(--bad)}
.filters{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}.filters input[type=text]{max-width:260px}
.empty{text-align:center;color:var(--text-2);padding:48px 16px}
@media (max-width:1000px){.grid2{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,1fr)}.outbox{grid-template-columns:1fr}.ob-list{max-height:220px}}
@media (max-width:820px){.app{grid-template-columns:1fr}.sidebar{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line);padding:12px}
.sidebar nav{display:flex;overflow-x:auto;gap:4px}.nav-label,.sidebar-foot{display:none}.content{padding:20px 14px 48px}.bubble{max-width:100%}}
`;

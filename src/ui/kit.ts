import { BUILD } from "../version.js";
import { CSS } from "./css.js";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ICONS: Record<string, string> = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  inbox: '<path d="M3 13l3-8h12l3 8"/><path d="M3 13v6h18v-6h-5l-1 2H9l-1-2z"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c2 .7 3.5 2.6 3.5 5.5"/>',
  send: '<path d="M21 3L3 11l7 3 3 7z"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01"/>',
  flag: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 01-12 0zM12 18v3"/>',
  refresh: '<path d="M20 11a8 8 0 00-14-4M4 4v4h4M4 13a8 8 0 0014 4M20 20v-4h-4"/>',
};

export const icon = (name: string) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;

export function ago(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function when(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function initials(first?: string | null, last?: string | null, email?: string | null): string {
  const s = `${(first ?? "").trim()[0] ?? ""}${(last ?? "").trim()[0] ?? ""}`.toUpperCase();
  return s || (email ?? "?")[0].toUpperCase();
}

export const fullName = (r: { first_name?: string | null; last_name?: string | null; email?: string | null }) =>
  `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.email || "Unknown";

export const badge = (text: string, tone = "") => `<span class="badge ${tone}">${esc(text)}</span>`;

export const CATEGORY_TONE: Record<string, string> = {
  interested: "good",
  not_now: "wait",
  objection: "wait",
  not_interested: "",
  unsubscribe: "bad",
  out_of_office: "",
  bounce: "bad",
  other: "note",
};

export const STATUS_LABEL: Record<string, string> = {
  new: "To review",
  chosen: "Chosen",
  skipped: "Skipped",
  drafted: "Drafted",
  contacted: "Contacted",
  replied: "Replied",
  closed: "Closed out",
};

export interface Ctx {
  c: number;
  token: string;
}

export const hidden = (x: Ctx, tab: string) =>
  `<input type="hidden" name="_t" value="${x.token}"><input type="hidden" name="c" value="${x.c}"><input type="hidden" name="tab" value="${tab}">`;

export const pageHead = (title: string, sub: string, actions = "") =>
  `<header class="page-head"><div><h1>${esc(title)}</h1><p>${sub}</p></div><div class="actions">${actions}</div></header>`;

export interface ShellOpts {
  c: number;
  tab: string;
  campaigns: { id: number; name: string }[];
  counts: { today: number; outbox: number; convo: number; leads: number };
  paused: boolean;
  running: boolean;
  msg: string;
  body: string;
}

const NAV: { label: string; items: [string, string, string, keyof ShellOpts["counts"] | null][] }[] = [
  { label: "Work", items: [["today", "Today", "home", "today"], ["outbox", "Outbox", "inbox", "outbox"], ["conversations", "Conversations", "message", "convo"]] },
  { label: "Pipeline", items: [["leads", "Leads", "users", "leads"], ["sources", "Sources", "plug", null], ["campaign", "Campaign", "send", null]] },
  { label: "System", items: [["activity", "Activity", "activity", null], ["settings", "Settings", "settings", null], ["help", "Help", "help", null]] },
];

export function shell(o: ShellOpts): string {
  const nav = NAV.map(
    (g) =>
      `<div class="nav-label">${g.label}</div>` +
      g.items
        .map(([tab, label, ic, key]) => {
          const n = key ? o.counts[key] : 0;
          const badgeHtml = key ? `<span class="count" id="nb-${tab}"${n ? "" : " hidden"}>${n}</span>` : "";
          return `<a class="nav-item${o.tab === tab ? " on" : ""}" href="/?c=${o.c}&tab=${tab}">${icon(ic)}${label}${badgeHtml}</a>`;
        })
        .join(""),
  ).join("");
  const picker =
    o.campaigns.length > 1
      ? `<form class="side-select" method="get"><input type="hidden" name="tab" value="${esc(o.tab)}"><select name="c" onchange="this.form.submit()">${o.campaigns
          .map((x) => `<option value="${x.id}"${x.id === o.c ? " selected" : ""}>${esc(x.name)}</option>`)
          .join("")}</select></form>`
      : "";
  const state = o.running ? ["busy", "Working..."] : o.paused ? ["paused", "Sending paused"] : ["", "Ready"];
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${o.running ? '<meta http-equiv="refresh" content="3">' : ""}<title>VATcube Leads Generator</title>
<script>try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
<style>${CSS}</style><body><div class="app">
<aside class="sidebar"><div class="brand"><b>VATcube</b><span>Leads Generator</span></div>${picker}<nav>${nav}</nav>
<div class="sidebar-foot"><div class="dotline"><span class="dot ${state[0]}"></span>${state[1]}</div>
<div class="actions"><button class="btn sm" type="button" id="theme">${icon("moon")}Theme</button><a class="btn sm" href="/?c=${o.c}&tab=${esc(o.tab)}">${icon("refresh")}Refresh</a></div><div class="meta">Version ${esc(BUILD)}</div></div></aside>
<main class="content">${o.msg ? `<div class="flash">${esc(o.msg)}</div>` : ""}${o.body}</main></div>
<script>document.getElementById("theme").onclick=function(){var d=document.documentElement,dark=d.getAttribute("data-theme")==="dark"||(!d.getAttribute("data-theme")&&matchMedia("(prefers-color-scheme:dark)").matches);var n=dark?"light":"dark";d.setAttribute("data-theme",n);try{localStorage.setItem("theme",n)}catch(e){}}</script>
</body></html>`;
}

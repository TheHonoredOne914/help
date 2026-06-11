import type { CouncilSession } from "./council-types";

export function councilDossierExportHtml(session: CouncilSession): string {
  const councillors = Object.values(session.councillors)
    .flatMap((output) => output ? [`
      <section>
        <h2>${escapeHtml(output.title)} <small>(${escapeHtml(output.councillor_id)}, ${escapeHtml(output.status)})</small></h2>
        <p>${escapeHtml(output.summary || output.raw_brief)}</p>
        <ul>${output.key_claims.map((claim) => `<li><strong>${escapeHtml(claim.stance)}</strong>: ${escapeHtml(claim.text)}</li>`).join("")}</ul>
      </section>
    `] : [])
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(session.topic)} Council Dossier</title>
  <style>
    body { font-family: Georgia, serif; margin: 40px; color: #121826; line-height: 1.55; }
    h1, h2 { color: #0f172a; }
    .seal { background: #ecfdf5; padding: 10px 12px; border-left: 4px solid #059669; }
    .dispute { background: #fffbeb; padding: 10px 12px; border-left: 4px solid #d97706; }
  </style>
</head>
<body>
  <h1>BestDel Council Dossier</h1>
  <p><strong>Agenda:</strong> ${escapeHtml(session.topic)}</p>
  <p><strong>Side:</strong> ${escapeHtml(session.stance)}</p>
  <p><strong>Status:</strong> ${escapeHtml(session.terminalStatus ?? session.status)}</p>
  <h2>Chief Councillor Verdict</h2>
  <p>${escapeHtml(session.verdict?.strategic_position || session.chief_verdict_stream || "Pending")}</p>
  ${session.verdict ? `
    <h2>Floor Strategy</h2>
    <h3>Top Arguments</h3>
    <ul>${session.verdict.top_arguments.map((a) => `<li>${escapeHtml(a.argument)} (${escapeHtml(a.strength)})</li>`).join("")}</ul>
    <h3>Vulnerabilities</h3>
    <ul>${session.verdict.top_vulnerabilities.map((v) => `<li>${escapeHtml(v.vulnerability)} (${escapeHtml(v.severity)})</li>`).join("")}</ul>
    <h3>POI Bank</h3>
    <ul>${session.verdict.poi_bank.map((p) => `<li>${escapeHtml(p.timing_cue)}: ${escapeHtml(p.poi)}${p.target_councillor ? ` (target: ${escapeHtml(p.target_councillor)})` : ""}</li>`).join("")}</ul>
  ` : ""}
  <h2>Council Seals (${session.seals.length})</h2>
  ${session.seals.map((seal) => `<p class="seal"><strong>${escapeHtml(seal.level)}</strong>: ${escapeHtml(seal.claim.text)} (${escapeHtml(seal.endorsing_councillors.join(", "))})</p>`).join("") || "<p>No Council Seal.</p>"}
  <h2>Conflict Lines (${session.disputes.length})</h2>
  ${session.disputes.map((d) => `<p class="dispute">${escapeHtml(d.claim_a.text)}<br><strong>Against:</strong> ${escapeHtml(d.claim_b.text)}</p>`).join("") || "<p>No disputes.</p>"}
  <h2>Councillor Briefs</h2>
  ${councillors}
</body>
</html>`;
}

export function downloadCouncilDossier(session: CouncilSession): void {
  const html = councilDossierExportHtml(session);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(session.topic || "council-dossier")}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeFileName(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || "council-dossier";
}

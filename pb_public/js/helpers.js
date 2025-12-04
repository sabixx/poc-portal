// Various pure helper functions (no state)

export function riskBadgeClass(risk) {
  if (risk === "on_track") return "risk-on_track";
  if (risk === "at_risk" || risk === "overdue") return "risk-at_risk";
  return "risk-unknown";
}

export function formatDate(dStr) {
  if (!dStr) return "–";
  const d = new Date(dStr);
  if (Number.isNaN(d.getTime())) return dStr;
  return d.toISOString().slice(0, 10);
}

export function mapStateToLabel(puc) {
  if (puc.is_completed) return "completed";
  if (puc.is_active) return "open";
  return "<not included>";
}

export function mapStateToClass(puc) {
  if (puc.is_completed) return "status-completed";
  if (puc.is_active) return "status-open";
  return "status-notincluded";
}

export function checkboxSymbol(puc) {
  return puc.is_completed ? "☑" : puc.is_active ? "☐" : "";
}

export function userDisplayLabel(user) {
  return (
    user.displayName ||
    user.email ||
    user.username ||
    user.name ||
    "Unknown SE"
  );
}

export function getSeLabelForPoc(poc, allUsers) {
  if (poc.expand && poc.expand.se) {
    return userDisplayLabel(poc.expand.se);
  }
  if (poc.se && allUsers && allUsers.length) {
    const found = allUsers.find((u) => u.id === poc.se);
    if (found) return userDisplayLabel(found);
  }
  return "Unknown SE";
}

export function getPucForPoc(pocId, allPuc) {
  return (allPuc || []).filter(
    (puc) => puc.poc === pocId && (puc.is_active || puc.is_completed)
  );
}

/** Escape one CSV cell (RFC-style). */
export function csvEscape(cell) {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Descarga un CSV con las alertas mostradas en pantalla (respeta filtros actuales).
 * BOM UTF-8 para que Excel abra bien tildes y ñ.
 */
export function downloadAlertsCsv(alerts, filename = "nacurutu-alertas.csv") {
  const headers = [
    "id",
    "timestamp",
    "type",
    "status",
    "user_name",
    "user_email",
    "user_phone",
    "organization_name",
    "latitude",
    "longitude",
    "message",
    "maps_link",
    "has_image",
    "has_audio",
    "archived",
  ];

  const rows = alerts.map((a) => {
    const lng = a.location?.coordinates?.[0];
    const lat = a.location?.coordinates?.[1];
    const maps =
      lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
        ? `https://www.google.com/maps?q=${lat},${lng}`
        : "";
    let msg = (a.message || "").replace(/\s+/g, " ").trim();
    if (msg.length > 800) msg = `${msg.slice(0, 800)}…`;

    const cells = [
      a.id,
      a.timestamp,
      a.type,
      a.status,
      a.user_name,
      a.user_email,
      a.user_phone,
      a.organization_name,
      lat ?? "",
      lng ?? "",
      msg,
      maps,
      a.image_url ? "si" : "no",
      a.audio_url ? "si" : "no",
      a.archived ? "si" : "no",
    ];
    return cells.map(csvEscape).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

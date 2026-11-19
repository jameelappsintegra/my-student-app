// RFC 4180 CSV with protection against spreadsheet formula injection: a cell
// starting with = + - @ (or tab/CR) is prefixed with ' so Excel shows it as text.
function cell(value) {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => cell(typeof c.value === "function" ? c.value(r) : r[c.value])).join(","));
  // BOM so Excel opens UTF-8 (₹, Tamil names) correctly.
  return `﻿${[head, ...body].join("\r\n")}\r\n`;
}

function sendCsv(res, filename, columns, rows) {
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
    "Cache-Control": "private, no-store",
  });
  res.send(toCsv(columns, rows));
}

module.exports = { toCsv, sendCsv, cell };

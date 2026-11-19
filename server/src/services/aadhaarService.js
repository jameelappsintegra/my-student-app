// Aadhaar Paperless Offline e-KYC. The parent downloads a ZIP from the
// myAadhaar website protected by a 4-character share code; the school
// uploads it here. We read the UIDAI-signed XML to pre-fill a form.
//
// Privacy: the file is processed in memory and never stored. Only the last
// 4 digits of the Aadhaar number (from the reference id) are returned, and
// EduPro doesn't save even those.
const fs = require("fs");
const AdmZip = require("adm-zip");
const { XMLParser } = require("fast-xml-parser");
const { SignedXml } = require("xml-crypto");
const ApiError = require("../utils/ApiError");

const MAX_AGE_DAYS = 3;

function extractXml(buffer, shareCode) {
  const head = buffer.slice(0, 64).toString("utf8").trimStart();
  if (head.startsWith("<")) return buffer.toString("utf8");
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw ApiError.badRequest("Upload the ZIP file downloaded from the myAadhaar website (or the XML inside it).");
  }
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw ApiError.badRequest("That ZIP file is damaged. Download it again from the myAadhaar website.");
  }
  const entry = zip.getEntries().find((e) => /\.xml$/i.test(e.entryName));
  if (!entry) throw ApiError.badRequest("The ZIP doesn't contain an Aadhaar XML file.");
  if (!shareCode) throw ApiError.badRequest("Enter the 4-character share code chosen when the file was downloaded.");
  let data;
  try {
    data = zip.readFile(entry, shareCode);
  } catch {
    data = null;
  }
  if (!data || !data.toString("utf8").trimStart().startsWith("<")) {
    throw ApiError.badRequest("The share code is wrong for this file.");
  }
  return data.toString("utf8");
}

// Checks the UIDAI signature when the UIDAI certificate is configured
// (UIDAI_OFFLINE_KYC_CERT = path to the PEM published by UIDAI).
function verifySignature(xml) {
  const certPath = process.env.UIDAI_OFFLINE_KYC_CERT;
  if (!certPath) return null;
  try {
    const cert = fs.readFileSync(certPath, "utf8");
    const parser = new (require("@xmldom/xmldom").DOMParser)();
    const doc = parser.parseFromString(xml, "text/xml");
    const sigNode = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
    if (!sigNode) return false;
    const sig = new SignedXml({ publicCert: cert, getCertFromKeyInfo: () => null });
    sig.loadSignature(sigNode);
    return sig.checkSignature(xml);
  } catch {
    return false;
  }
}

const GENDER = { M: "male", F: "female", T: "other" };

// "S/O: Ramesh Kumar" → { relation: "father", name: "Ramesh Kumar" }
function careOf(value) {
  const m = String(value || "").match(/^\s*(S\/O|D\/O|C\/O|W\/O|H\/O)\s*:?\s*(.+)$/i);
  if (!m) return value ? { relation: "guardian", name: value.trim() } : null;
  const rel = m[1].toUpperCase();
  return { relation: rel === "S/O" || rel === "D/O" ? "father" : "guardian", name: m[2].trim() };
}

function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] };
}

function parseOfflineKyc(buffer, shareCode) {
  const xml = extractXml(buffer, shareCode);
  // No entity expansion: protects against XML bombs and external entities.
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", processEntities: false, allowBooleanAttributes: true });
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    throw ApiError.badRequest("The Aadhaar XML can't be read.");
  }
  const root = doc.OfflinePaperlessKyc;
  const uid = root?.UidData;
  if (!uid?.Poi) throw ApiError.badRequest("This isn't an Aadhaar Offline e-KYC file.");
  const poi = uid.Poi;
  const poa = uid.Poa || {};
  const ref = String(root.referenceId || "");
  const last4 = /^\d{4}/.test(ref) ? ref.slice(0, 4) : null;
  // referenceId = last 4 digits + yyyyMMddHHmmssSSS
  const ts = ref.slice(4, 18).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  const generatedAt = ts ? new Date(`${ts[1]}-${ts[2]}-${ts[3]}T${ts[4]}:${ts[5]}:${ts[6]}+05:30`) : null;
  const dob = String(poi.dob || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const address = [poa.house, poa.street, poa.landmark, poa.loc, poa.vtc, poa.po, poa.subdist, poa.dist, poa.state, poa.pc]
    .map((v) => (v === undefined ? "" : String(v).trim()))
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");
  const co = careOf(poa.careof);
  const photo = typeof uid.Pht === "string" && uid.Pht.length > 100 ? `data:image/jpeg;base64,${uid.Pht.replace(/\s/g, "")}` : null;
  const verified = verifySignature(xml);
  const warnings = [];
  if (verified === null) warnings.push("The UIDAI signature wasn't checked because the UIDAI certificate isn't configured on this server. Compare the details with the child's documents.");
  if (verified === false) warnings.push("The UIDAI signature check failed. This file may have been altered; don't rely on it.");
  if (generatedAt && Date.now() - generatedAt.getTime() > MAX_AGE_DAYS * 86400000) {
    warnings.push(`The file was generated on ${generatedAt.toISOString().slice(0, 10)}. UIDAI recommends using files less than ${MAX_AGE_DAYS} days old.`);
  }
  return {
    ...splitName(poi.name),
    dateOfBirth: dob ? `${dob[3]}-${dob[2]}-${dob[1]}` : null,
    gender: GENDER[String(poi.gender || "").toUpperCase()] || null,
    address,
    father: co?.relation === "father" ? { name: co.name } : undefined,
    guardian: co?.relation === "guardian" ? { name: co.name } : undefined,
    photo,
    aadhaarLast4: last4,
    generatedAt,
    verified,
    warnings,
  };
}

module.exports = { parseOfflineKyc, careOf, splitName };

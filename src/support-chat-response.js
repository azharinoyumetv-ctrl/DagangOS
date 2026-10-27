// Provider diagnostics are operational data, never customer-facing answers.
const diagnosticPatterns = [
  /^\s*(?:⚠\uFE0F?|❌)\s*/,
  /\bprovider\s+(?:authentication|authorization|request|connection)\s+(?:failed|error)/i,
  /\bnous\s+(?:portal|research)\b|\bhermes\s+(?:model|auth|login|gateway)\b/i,
  /\b(?:no|missing|invalid|expired|revoked)\b.{0,45}\b(?:access[ _-]?token|refresh[ _-]?token|api[ _-]?key|credentials?)\b/i,
  /\b(?:access[ _-]?token|refresh[ _-]?token|api[ _-]?key|credentials?)\b.{0,45}\b(?:not found|missing|invalid|expired|revoked|required)\b/i,
  /\b(?:authentication|authorization)\s+(?:failed|error)|\bre-authenticat(?:e|ion)\b/i,
  /\b(?:traceback \(most recent call last\)|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|HTTPError|AuthenticationError|RateLimitError)\b/i,
  /\b(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{20,})\b/,
];

export function hasSupportDiagnostic(text) {
  return typeof text === 'string' && diagnosticPatterns.some(pattern => pattern.test(text));
}

export function readPublicSupportReply(payload) {
  if (!payload || typeof payload !== 'object' || payload.error || payload.success === false || payload.available === false) return null;
  const reply = typeof payload.reply === 'string' ? payload.reply : typeof payload.result === 'string' ? payload.result : '';
  return reply.trim() && !hasSupportDiagnostic(reply) ? reply.trim() : null;
}

export function supportUnavailableMessage(scopeId) {
  const contact = scopeId === 'geraina' || scopeId === 'dapuros'
    ? `https://dagangos.com/${scopeId}#kontak`
    : 'https://dagangos.com/kontak';
  return `Asisten otomatis sedang tidak tersedia. Silakan coba lagi atau hubungi tim melalui ${contact}`;
}

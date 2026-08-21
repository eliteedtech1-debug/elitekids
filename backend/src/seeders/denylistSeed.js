/**
 * kids_denylist_rules seed data — the deterministic, human-curated denylist.
 *
 * These are STARTING rules for a children's product; they must be reviewed and
 * extended by a human before pilot. Categories: violence, fear, adult content,
 * weapons, drugs, commercial/cross-promotion, unsafe-actions, hate/discrimination,
 * self-harm, religion-politics (keep neutral for schools).
 */
module.exports = [
  // ── Violence / weapons ────────────────────────────────────────────────
  { rule: 'gun', category: 'weapons' },
  { rule: 'knife', category: 'weapons' },
  { rule: 'weapon', category: 'weapons' },
  { rule: 'bomb', category: 'violence' },
  { rule: 'kill', category: 'violence' },
  { rule: 'kill someone', category: 'violence' },
  { rule: 'stab', category: 'violence' },
  { rule: 'fight scene', category: 'violence' },
  { rule: 'blood', category: 'violence' },
  // ── Fear / horror / scary content ─────────────────────────────────────
  { rule: 'monster', category: 'fear' },
  { rule: 'scary ghost', category: 'fear' },
  { rule: 'horror', category: 'fear' },
  { rule: 'nightmare', category: 'fear' },
  // ── Adult / inappropriate ─────────────────────────────────────────────
  { rule: 'alcohol', category: 'adult' },
  { rule: 'beer', category: 'adult' },
  { rule: 'cigarette', category: 'adult' },
  { rule: 'drugs', category: 'adult' },
  { rule: 'romantic scene', category: 'adult' },
  { rule: 'dating', category: 'adult' },
  // ── Unsafe actions (children must not imitate) ────────────────────────
  { rule: 'jump off', category: 'unsafe-actions' },
  { rule: 'play with fire', category: 'unsafe-actions' },
  { rule: 'touch fire', category: 'unsafe-actions' },
  { rule: 'run across road', category: 'unsafe-actions' },
  { rule: 'take medicine yourself', category: 'unsafe-actions' },
  // ── Discrimination / hate / self-harm ─────────────────────────────────
  { rule: 'hate', category: 'hate' },
  { rule: 'stupid', category: 'hate' },
  { rule: 'hurt yourself', category: 'self-harm' },
  // ── Commercial / cross-promotion ──────────────────────────────────────
  { rule: 'buy our product', category: 'commercial' },
  { rule: 'subscribe to', category: 'commercial' },
];

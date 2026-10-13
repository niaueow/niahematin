import { z } from "zod";
import type { Category } from "../core/types.js";

const slangAmounts = new Map<string, number>([
  ["goceng", 5_000],
  ["ceban", 10_000],
  ["seceng", 1_000],
  ["gocap", 50_000],
  ["cepek", 100_000],
  ["gopek", 500_000]
]);

const categoryKeywords: Array<{ category: Category; words: string[] }> = [
  { category: "GROCERIES", words: ["alfamart", "indomaret", "beras", "telur", "galon", "sabun", "belanja", "groceries"] },
  { category: "JAJAN", words: ["kopi", "boba", "es", "snack", "cilok", "bakso", "seblak", "jajan", "minum"] },
  { category: "MAKAN", words: ["makan", "nasi", "ayam", "warteg", "nasgor", "mie", "lauk", "soto", "pecel"] },
  { category: "TRANSPORT", words: ["gojek", "grab", "maxim", "bensin", "parkir", "angkot", "transport"] },
  { category: "TAGIHAN", words: ["pulsa", "paket", "data", "spotify", "netflix", "icloud", "langganan"] },
  { category: "FUN", words: ["nongkrong", "nonton", "game", "bioskop", "main"] },
  { category: "RANDOM", words: ["random", "barang", "case", "stiker", "aksesoris"] }
];

export const quickLogSchema = z.object({
  amount: z.number().int().positive(),
  note: z.string().min(1),
  category: z.enum(["MAKAN", "GROCERIES", "JAJAN", "RANDOM", "TRANSPORT", "FUN", "TAGIHAN", "LAIN_LAIN", "UNTRACKED"]),
  confidence: z.number().min(0).max(1)
});

export type QuickLog = z.infer<typeof quickLogSchema>;

/**
 * Parse a single quick-log message.
 * Returns null (never throws) on invalid input so the bot handler can
 * reply helpfully instead of crashing. (BUG-004 fix)
 */
export function parseQuickLog(rawText: string): QuickLog | null {
  const text = rawText.trim().toLowerCase();
  if (!text || text.startsWith("/")) return null;

  const parsed = parseAmount(text);
  if (!parsed) return null;

  const note = text
    .replace(parsed.raw, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!note) return null;

  const { category, confidence } = inferCategory(note);

  // BUG-004 fix: use safeParse so ZodError is never thrown to caller
  const result = quickLogSchema.safeParse({
    amount: parsed.amount,
    note,
    category,
    confidence
  });

  return result.success ? result.data : null;
}

/**
 * Detect whether a message looks like it contains multiple expense items.
 * Returns true when two or more distinct amount tokens are found.
 * (BUG-003 fix: callers can ask for clarification instead of silently dropping)
 */
export function hasMultipleItems(rawText: string): boolean {
  const text = rawText.trim().toLowerCase();
  if (!text || text.startsWith("/")) return false;

  // Count slang hits
  let slangCount = 0;
  for (const word of slangAmounts.keys()) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) slangCount++;
  }
  if (slangCount > 1) return true;

  // Count numeric amount tokens (e.g. "15k", "20", "1jt")
  const numericMatches = text.match(/\d+(?:[.,]\d+)?(?:\s?(?:rb|ribu|k|jt|juta))?/gi) ?? [];
  return numericMatches.length > 1;
}

function parseAmount(text: string): { amount: number; raw: string } | null {
  for (const [word, amount] of slangAmounts.entries()) {
    const match = new RegExp(`\\b${word}\\b`, "i").exec(text);
    if (match) return { amount, raw: match[0] };
  }

  const match = /(?:^|\s)(\d+(?:[.,]\d+)?)(?:\s?)(rb|ribu|k|jt|juta)?(?=\s|$)/i.exec(text);
  if (!match?.[1]) return null;

  const rawNumber = match[1];
  const suffix = match[2]?.toLowerCase();
  let amount: number;

  if (rawNumber.includes(".") && !rawNumber.includes(",")) {
    amount = Number(rawNumber.replace(/\./g, ""));
  } else {
    amount = Number(rawNumber.replace(",", "."));
  }

  if (suffix === "jt" || suffix === "juta") amount *= 1_000_000;
  else if (suffix === "rb" || suffix === "ribu" || suffix === "k") amount *= 1_000;
  else if (amount < 1_000) amount *= 1_000;

  return { amount: Math.round(amount), raw: match[0].trim() };
}

function inferCategory(note: string): { category: Category; confidence: number } {
  for (const rule of categoryKeywords) {
    const matched = rule.words.some((word) =>
      new RegExp(`\\b${word}\\b`, "i").test(note)
    );
    if (matched) {
      return { category: rule.category, confidence: 0.9 };
    }
  }
  return { category: "LAIN_LAIN", confidence: 0.35 };
}

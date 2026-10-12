import { z } from "zod";
import type { Category } from "../core/types.js";

const slangAmounts = new Map<string, number>([
  ["goceng", 5_000],
  ["ceban", 10_000],
  ["seceng", 1_000],
  ["goban", 50_000],
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
  return quickLogSchema.parse({
    amount: parsed.amount,
    note,
    category,
    confidence
  });
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
    if (rule.words.some((word) => note.includes(word))) {
      return { category: rule.category, confidence: 0.9 };
    }
  }
  return { category: "LAIN_LAIN", confidence: 0.35 };
}

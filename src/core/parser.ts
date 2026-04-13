import dayjs from "dayjs";
import { ParsedAsset, ParsedTransaction } from "../types/domain.js";

const expenseKeywords = ["makan", "bakso", "nasi", "kopi", "jajan"];

function parseAmount(raw: string): number {
  const cleaned = raw
    .toLowerCase()
    .replace(/rp/g, "")
    .replace(/\./g, "")
    .replace(/,/g, "")
    .trim();

  if (cleaned.endsWith("rb")) return Number(cleaned.replace("rb", "")) * 1_000;
  if (cleaned.endsWith("jt")) return Number(cleaned.replace("jt", "")) * 1_000_000;

  return Number(cleaned);
}

function detectCategory(description: string): string {
  const d = description.toLowerCase();
  if (expenseKeywords.some((k) => d.includes(k))) return "makanan";
  return "lainnya";
}

export function parseTransactionCommand(text: string): ParsedTransaction | null {
  const trimmed = text.trim();
  const m = trimmed.match(/^\/(pengeluaran|pemasukan)\s+(.+)\s+(\S+)$/i);
  if (!m) return null;

  const [, rawType, rawDescription, rawAmount] = m;
  const amount = parseAmount(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const type = rawType.toLowerCase() === "pengeluaran" ? "expense" : "income";
  const description = rawDescription.trim();

  return {
    type,
    amount,
    category: detectCategory(description),
    description,
    date: dayjs().format("YYYY-MM-DD")
  };
}

export function parseAssetCommand(text: string): ParsedAsset | null {
  const trimmed = text.trim();
  const m = trimmed.match(/^\/menabung\s+(.+)\s+sejumlah\s+(\S+)\s+(\w+)$/i);
  if (!m) return null;

  const [, rawName, rawQty, rawUnit] = m;
  const quantity = parseAmount(rawQty);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  return {
    type: "gold",
    name: rawName.trim(),
    quantity,
    unit: rawUnit.toLowerCase(),
    currency: "IDR",
    last_updated: dayjs().toISOString()
  };
}

export function parseRegisterCommand(text: string): { displayName?: string } | null {
  const trimmed = text.trim();
  const m = trimmed.match(/^\/(daftar|register)(?:\s+(.+))?$/i);
  if (!m) return null;

  const displayName = m[2]?.trim();
  return displayName ? { displayName } : {};
}

export function parseStatisticCommand(text: string): { year?: number; month?: number } | null {
  const trimmed = text.trim();
  const m = trimmed.match(/^\/statistik(?:\s+(\d{4})(?:-(\d{2}))?)?$/i);
  if (!m) return null;

  const year = m[1] ? Number(m[1]) : undefined;
  const month = m[2] ? Number(m[2]) : undefined;

  if (month !== undefined && (month < 1 || month > 12)) return null;

  return { year, month };
}

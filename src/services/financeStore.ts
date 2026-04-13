import dayjs from "dayjs";
import { prisma } from "./db.js";
import { ParsedAsset, ParsedTransaction } from "../types/domain.js";

export async function createTransaction(userId: string, item: ParsedTransaction) {
  return prisma.transaction.create({
    data: {
      userId,
      type: item.type,
      amount: item.amount,
      category: item.category,
      description: item.description,
      date: dayjs(item.date, "YYYY-MM-DD").toDate(),
      paymentMethod: item.payment_method ?? null
    }
  });
}

export async function createAsset(userId: string, item: ParsedAsset) {
  return prisma.asset.create({
    data: {
      userId,
      type: item.type,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      buyPrice: item.buy_price ?? null,
      currentPrice: item.current_price ?? null,
      currency: item.currency,
      lastUpdated: new Date(item.last_updated)
    }
  });
}

export async function getStats(userId: string, period?: { year?: number; month?: number }) {
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (period?.year && period?.month) {
    startDate = dayjs(`${period.year}-${String(period.month).padStart(2, "0")}-01`).startOf("month").toDate();
    endDate = dayjs(startDate).endOf("month").toDate();
  } else if (period?.year) {
    startDate = dayjs(`${period.year}-01-01`).startOf("year").toDate();
    endDate = dayjs(startDate).endOf("year").toDate();
  }

  const where = startDate && endDate
    ? { userId, date: { gte: startDate, lte: endDate } }
    : { userId };

  const tx = await prisma.transaction.findMany({
    where,
    select: { type: true, amount: true, category: true }
  });

  const assets = await prisma.asset.findMany({
    where: { userId },
    select: { currentPrice: true, buyPrice: true, quantity: true }
  });

  let income = 0;
  let expense = 0;
  const expenseByCategory = new Map<string, number>();

  for (const row of tx) {
    if (row.type === "income") {
      income += row.amount;
      continue;
    }

    expense += row.amount;
    expenseByCategory.set(row.category, (expenseByCategory.get(row.category) ?? 0) + row.amount);
  }

  const topCategories = [...expenseByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const assetValue = assets.reduce((sum, a) => {
    const price = a.currentPrice ?? a.buyPrice ?? 0;
    return sum + price * a.quantity;
  }, 0);

  return {
    totalTx: tx.length,
    income,
    expense,
    balance: income - expense,
    assetValue: Math.round(assetValue),
    topCategories
  };
}


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

export async function getUserSummary(userId: string) {
  const [txCount, assetCount, lastTx, lastAsset] = await Promise.all([
    prisma.transaction.count({ where: { userId } }),
    prisma.asset.count({ where: { userId } }),
    prisma.transaction.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, type: true, amount: true, description: true }
    }),
    prisma.asset.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, name: true, quantity: true, unit: true }
    })
  ]);

  return {
    txCount,
    assetCount,
    lastTx,
    lastAsset
  };
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlCell(value: string | number): string {
  if (typeof value === "number") {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }

  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function xmlRow(values: Array<string | number>): string {
  return `<Row>${values.map((value) => xmlCell(value)).join("")}</Row>`;
}

function buildWorksheet(name: string, rows: Array<Array<string | number>>): string {
  return [
    `<Worksheet ss:Name="${escapeXml(name)}">`,
    "<Table>",
    ...rows.map((row) => xmlRow(row)),
    "</Table>",
    "</Worksheet>"
  ].join("");
}

export async function buildUserExportWorkbook(userId: string, displayName: string) {
  const [transactions, assets] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: "desc" }
    }),
    prisma.asset.findMany({
      where: { userId },
      orderBy: { lastUpdated: "desc" }
    })
  ]);

  const transactionRows: Array<Array<string | number>> = [
    ["Tanggal", "Tipe", "Kategori", "Deskripsi", "Nominal", "Metode", "Dibuat"],
    ...transactions.map((tx) => ([
      dayjs(tx.date).format("YYYY-MM-DD"),
      tx.type,
      tx.category,
      tx.description,
      tx.amount,
      tx.paymentMethod ?? "-",
      dayjs(tx.createdAt).format("YYYY-MM-DD HH:mm:ss")
    ]))
  ];

  const assetRows: Array<Array<string | number>> = [
    ["Nama", "Tipe", "Jumlah", "Satuan", "Buy Price", "Current Price", "Currency", "Last Updated"],
    ...assets.map((asset) => ([
      asset.name,
      asset.type,
      asset.quantity,
      asset.unit,
      asset.buyPrice ?? 0,
      asset.currentPrice ?? 0,
      asset.currency,
      dayjs(asset.lastUpdated).format("YYYY-MM-DD HH:mm:ss")
    ]))
  ];

  const xml = [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    buildWorksheet("Transactions", transactionRows),
    buildWorksheet("Assets", assetRows),
    "</Workbook>"
  ].join("");

  const safeName = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user";
  const dateTag = dayjs().format("YYYYMMDD-HHmmss");

  return {
    fileName: `export-${safeName}-${dateTag}.xls`,
    mimeType: "application/vnd.ms-excel",
    buffer: Buffer.from(xml, "utf-8"),
    transactionCount: transactions.length,
    assetCount: assets.length
  };
}

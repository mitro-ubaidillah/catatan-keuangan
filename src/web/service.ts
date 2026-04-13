import bcrypt from "bcryptjs";
import dayjs from "dayjs";
import { prisma } from "../services/db.js";

export async function ensureBootstrapSuperadmin(email?: string, password?: string) {
  if (!email || !password) return;

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "superadmin",
        isActive: true,
        passwordHash
      }
    });
    return;
  }

  await prisma.user.create({
    data: {
      displayName: "Superadmin",
      email: normalizedEmail,
      passwordHash,
      role: "superadmin",
      isActive: true
    }
  });
}

export async function registerWebUser(params: { displayName: string; email: string; password: string }) {
  const email = params.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("EMAIL_ALREADY_USED");

  const passwordHash = await bcrypt.hash(params.password, 10);
  return prisma.user.create({
    data: {
      displayName: params.displayName.trim(),
      email,
      passwordHash,
      role: "user",
      isActive: true
    }
  });
}

export async function loginWebUser(emailInput: string, passwordInput: string) {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;
  if (!user.isActive) return "INACTIVE" as const;

  const ok = await bcrypt.compare(passwordInput, user.passwordHash);
  if (!ok) return null;
  return user;
}

export async function getUserDashboardData(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const monthStart = dayjs().startOf("month").toDate();
  const monthEnd = dayjs().endOf("month").toDate();
  const monthTx = await prisma.transaction.findMany({
    where: { userId, date: { gte: monthStart, lte: monthEnd } },
    orderBy: { date: "desc" },
    take: 8
  });
  const recentAssets = await prisma.asset.findMany({
    where: { userId },
    orderBy: { lastUpdated: "desc" },
    take: 8
  });

  const allTxCount = await prisma.transaction.count({ where: { userId } });
  const allAssetCount = await prisma.asset.count({ where: { userId } });
  const income = monthTx.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0);
  const expense = monthTx.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0);

  return {
    user,
    stats: {
      allTxCount,
      allAssetCount,
      monthIncome: income,
      monthExpense: expense,
      monthBalance: income - expense
    },
    monthTx,
    recentAssets
  };
}

export async function getAdminDashboardData() {
  const [users, txCount, assetCount, lastTx, lastAssets] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { transactions: true, assets: true } } }
    }),
    prisma.transaction.count(),
    prisma.asset.count(),
    prisma.transaction.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: true } }),
    prisma.asset.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: true } })
  ]);

  return { users, txCount, assetCount, lastTx, lastAssets };
}

export async function updateUserRole(userId: string, role: "user" | "superadmin") {
  return prisma.user.update({
    where: { id: userId },
    data: { role }
  });
}

export async function toggleUserActive(userId: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new Error("USER_NOT_FOUND");
  return prisma.user.update({
    where: { id: userId },
    data: { isActive: !existing.isActive }
  });
}

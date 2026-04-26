import bcrypt from "bcryptjs";
import dayjs from "dayjs";
import crypto from "node:crypto";
import { prisma } from "../services/db.js";
import { config } from "../config.js";

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
        subscriptionPlan: "enterprise",
        subscriptionStatus: "active",
        subscriptionEndsAt: null,
        isActive: true,
        deletedAt: null,
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
      subscriptionPlan: "enterprise",
      subscriptionStatus: "active",
      subscriptionEndsAt: null,
      isActive: true,
      deletedAt: null
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
      subscriptionPlan: "free_trial",
      subscriptionStatus: "active",
      subscriptionEndsAt: dayjs().add(config.SUBSCRIPTION_TRIAL_DAYS, "day").toDate(),
      isActive: true
    }
  });
}

export async function createOnboardingTokenForUser(userId: string) {
  await prisma.onboardingToken.deleteMany({
    where: { userId, usedAt: null }
  });

  const token = crypto.randomBytes(24).toString("base64url");
  const record = await prisma.onboardingToken.create({
    data: {
      userId,
      token,
      expiresAt: dayjs().add(config.ONBOARDING_TOKEN_TTL_HOURS, "hour").toDate()
    }
  });

  return record;
}

export async function getOnboardingTokenData(token: string) {
  return prisma.onboardingToken.findUnique({
    where: { token },
    include: { user: true }
  });
}

export async function completeOnboarding(params: {
  token: string;
  email: string;
  password: string;
  displayName?: string;
}) {
  const tokenRecord = await prisma.onboardingToken.findUnique({
    where: { token: params.token },
    include: { user: true }
  });
  if (!tokenRecord) throw new Error("ONBOARDING_TOKEN_NOT_FOUND");
  if (tokenRecord.usedAt) throw new Error("ONBOARDING_TOKEN_USED");
  if (tokenRecord.expiresAt.getTime() < Date.now()) throw new Error("ONBOARDING_TOKEN_EXPIRED");

  const email = params.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== tokenRecord.userId) throw new Error("EMAIL_ALREADY_USED");

  const passwordHash = await bcrypt.hash(params.password, 10);
  const user = await prisma.user.update({
    where: { id: tokenRecord.userId },
    data: {
      email,
      passwordHash,
      ...(params.displayName?.trim() ? { displayName: params.displayName.trim() } : {})
    }
  });

  await prisma.onboardingToken.update({
    where: { id: tokenRecord.id },
    data: { usedAt: new Date() }
  });

  return user;
}

export async function loginWebUser(emailInput: string, passwordInput: string) {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;
  if (user.deletedAt) return "DELETED" as const;
  if (!user.isActive) return "INACTIVE" as const;

  const ok = await bcrypt.compare(passwordInput, user.passwordHash);
  if (!ok) return null;
  return user;
}

export function hasActiveSubscription(user: {
  role: string;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null;
}): boolean {
  if (user.role === "superadmin") return true;
  if (user.subscriptionStatus !== "active") return false;
  if (!user.subscriptionEndsAt) return true;
  return user.subscriptionEndsAt.getTime() >= Date.now();
}

export async function getUserDashboardData(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return null;

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
    subscriptionActive: hasActiveSubscription(user),
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
  const [users, txCount, assetCount, lastTx, lastAssets, lastUsers] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { transactions: true, assets: true } } }
    }),
    prisma.transaction.count(),
    prisma.asset.count(),
    prisma.transaction.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: true } }),
    prisma.asset.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: true } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 10 })
  ]);

  return { users, txCount, assetCount, lastTx, lastAssets, lastUsers };
}

export async function updateUserRole(userId: string, role: "user" | "superadmin") {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new Error("USER_NOT_FOUND");
  if (existing.deletedAt) throw new Error("USER_SOFT_DELETED");

  return prisma.user.update({
    where: { id: userId },
    data: {
      role,
      ...(role === "superadmin"
        ? {
            subscriptionPlan: "enterprise",
            subscriptionStatus: "active",
            subscriptionEndsAt: null
          }
        : {})
    }
  });
}

export async function toggleUserActive(userId: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new Error("USER_NOT_FOUND");
  if (existing.deletedAt) throw new Error("USER_SOFT_DELETED");
  return prisma.user.update({
    where: { id: userId },
    data: { isActive: !existing.isActive }
  });
}

export async function updateUserSubscription(params: {
  userId: string;
  plan: string;
  status: "active" | "past_due" | "suspended" | "canceled";
  durationDays?: number;
}) {
  const { userId, plan, status, durationDays } = params;
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new Error("USER_NOT_FOUND");
  if (existing.deletedAt) throw new Error("USER_SOFT_DELETED");
  if (existing.role === "superadmin") throw new Error("SUPERADMIN_SUBSCRIPTION_LOCKED");

  const endsAt = status === "active"
    ? (durationDays && durationDays > 0 ? dayjs().add(durationDays, "day").toDate() : null)
    : dayjs().toDate();

  return prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionPlan: plan,
      subscriptionStatus: status,
      subscriptionEndsAt: endsAt
    }
  });
}

export async function softDeleteUserByAdmin(userId: string, actorUserId?: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new Error("USER_NOT_FOUND");
  if (existing.deletedAt) throw new Error("USER_ALREADY_SOFT_DELETED");
  if (existing.role === "superadmin") throw new Error("SUPERADMIN_DELETE_LOCKED");
  if (actorUserId && existing.id === actorUserId) throw new Error("CANNOT_DELETE_SELF");

  return prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      isActive: false,
      subscriptionStatus: "canceled",
      subscriptionEndsAt: new Date()
    }
  });
}

export async function restoreSoftDeletedUserByAdmin(userId: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new Error("USER_NOT_FOUND");
  if (!existing.deletedAt) throw new Error("USER_NOT_SOFT_DELETED");

  return prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: null,
      isActive: true
    }
  });
}

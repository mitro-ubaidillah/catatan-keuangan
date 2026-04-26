import { User } from "@prisma/client";
import dayjs from "dayjs";
import { prisma } from "./db.js";
import { config } from "../config.js";

type Platform = "telegram" | "whatsapp";

export async function findUserByExternalId(platform: Platform, externalUserId: string): Promise<User | null> {
  if (platform === "telegram") {
    return prisma.user.findFirst({
      where: { telegramId: externalUserId, deletedAt: null }
    });
  }

  return prisma.user.findFirst({
    where: { waJid: externalUserId, deletedAt: null }
  });
}

export async function upsertUserByExternalId(params: {
  platform: Platform;
  externalUserId: string;
  displayName: string;
}): Promise<User> {
  const { platform, externalUserId, displayName } = params;

  if (platform === "telegram") {
    const existing = await prisma.user.findUnique({ where: { telegramId: externalUserId } });
    if (existing?.deletedAt) throw new Error("USER_SOFT_DELETED");

    if (existing) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { displayName }
      });
    }

    return prisma.user.create({
      data: {
        displayName,
        telegramId: externalUserId,
        subscriptionPlan: "free_trial",
        subscriptionStatus: "active",
        subscriptionEndsAt: dayjs().add(config.SUBSCRIPTION_TRIAL_DAYS, "day").toDate()
      }
    });
  }

  const existing = await prisma.user.findUnique({ where: { waJid: externalUserId } });
  if (existing?.deletedAt) throw new Error("USER_SOFT_DELETED");

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { displayName }
    });
  }

  return prisma.user.create({
    data: {
      displayName,
      waJid: externalUserId,
      subscriptionPlan: "free_trial",
      subscriptionStatus: "active",
      subscriptionEndsAt: dayjs().add(config.SUBSCRIPTION_TRIAL_DAYS, "day").toDate()
    }
  });
}

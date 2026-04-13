import { User } from "@prisma/client";
import { prisma } from "./db.js";

type Platform = "telegram" | "whatsapp";

export async function findUserByExternalId(platform: Platform, externalUserId: string): Promise<User | null> {
  if (platform === "telegram") {
    return prisma.user.findUnique({ where: { telegramId: externalUserId } });
  }

  return prisma.user.findUnique({ where: { waJid: externalUserId } });
}

export async function upsertUserByExternalId(params: {
  platform: Platform;
  externalUserId: string;
  displayName: string;
}): Promise<User> {
  const { platform, externalUserId, displayName } = params;

  if (platform === "telegram") {
    return prisma.user.upsert({
      where: { telegramId: externalUserId },
      create: {
        displayName,
        telegramId: externalUserId
      },
      update: {
        displayName
      }
    });
  }

  return prisma.user.upsert({
    where: { waJid: externalUserId },
    create: {
      displayName,
      waJid: externalUserId
    },
    update: {
      displayName
    }
  });
}

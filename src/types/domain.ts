export type Platform = "telegram" | "whatsapp";

export type ParsedTransaction = {
  type: "expense" | "income";
  amount: number;
  category: string;
  description: string;
  date: string;
  payment_method?: string;
};

export type ParsedAsset = {
  type: string;
  name: string;
  quantity: number;
  unit: string;
  buy_price?: number;
  current_price?: number;
  currency: string;
  last_updated: string;
};

export type IncomingMessage = {
  platform: Platform;
  externalChatId: string;
  externalUserId: string;
  text: string;
  timestamp: Date;
};

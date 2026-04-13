import { parseAssetCommand, parseRegisterCommand, parseStatisticCommand, parseTransactionCommand } from "./parser.js";

export function handleCommand(text: string):
  | { kind: "transaction"; payload: ReturnType<typeof parseTransactionCommand> }
  | { kind: "asset"; payload: ReturnType<typeof parseAssetCommand> }
  | { kind: "register"; payload: ReturnType<typeof parseRegisterCommand> }
  | { kind: "stat"; payload: ReturnType<typeof parseStatisticCommand> }
  | { kind: "sheet" }
  | { kind: "health" }
  | { kind: "unknown" } {
  if (/^\/sheet/i.test(text)) return { kind: "sheet" };
  if (/^\/(health|ping)/i.test(text)) return { kind: "health" };

  const stat = parseStatisticCommand(text);
  if (stat) return { kind: "stat", payload: stat };

  const register = parseRegisterCommand(text);
  if (register) return { kind: "register", payload: register };

  const tx = parseTransactionCommand(text);
  if (tx) return { kind: "transaction", payload: tx };

  const asset = parseAssetCommand(text);
  if (asset) return { kind: "asset", payload: asset };

  return { kind: "unknown" };
}

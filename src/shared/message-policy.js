import { isAllowedNeopetsPageUrl, isOwnShopStockUrl, isShopWizardUrl } from "./validation.js";

export function validateExtensionSender(sender, extensionId, pageKind) {
  if (
    typeof extensionId !== "string" ||
    sender?.id !== extensionId ||
    !Number.isInteger(sender.tab?.id) ||
    typeof sender.tab?.url !== "string"
  ) {
    return false;
  }
  if (pageKind === "neopets") return isAllowedNeopetsPageUrl(sender.tab.url);
  if (pageKind === "pricing") return isOwnShopStockUrl(sender.tab.url);
  if (pageKind === "purchase") return isShopWizardUrl(sender.tab.url);
  return false;
}

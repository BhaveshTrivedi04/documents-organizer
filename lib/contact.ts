// Who makes and supports the app. Shared between the browser and the server.

export const COMPANY = "VC Digital and Finance";
export const CONTACT_NAME = "Vyom";
export const CONTACT_PHONE = "92271 61240";
export const CONTACT_EMAIL = "vyom6943@gmail.com";
/** Country code + number, as WhatsApp links need it. */
const WHATSAPP_NUMBER = "919227161240";

/**
 * Plain link to chat with us. Used inside messages: WhatsApp cuts a link short
 * at characters like an apostrophe, so links with typed-in text break there.
 */
export const WHATSAPP_CHAT = `https://wa.me/${WHATSAPP_NUMBER}`;

/** Opens a WhatsApp chat with us, with `text` already typed in. */
export function whatsappToUs(text: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

/** Opens WhatsApp to pick any contact, with `text` already typed in. */
export function whatsappShare(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Where friends go to buy the app. NEXT_PUBLIC_BUY_URL can point every copy at
 * one page; otherwise it's the /buy page of the copy being used.
 */
export function buyUrl(): string {
  return process.env.NEXT_PUBLIC_BUY_URL || `${window.location.origin}/buy`;
}

/** What a friend receives on WhatsApp: a short note, the buy link and how to reach us. */
export function shareMessage(): string {
  return [
    `I keep all my family's important papers (Aadhaar, PAN, policies, reports…) safe in one private app on my phone, and find any of them in seconds. It's made by *${COMPANY}*.`,
    "",
    "Get it for your family:",
    buyUrl(),
    "",
    `Questions? WhatsApp ${CONTACT_NAME}:`,
    WHATSAPP_CHAT,
    `📞 ${CONTACT_PHONE}  ✉️ ${CONTACT_EMAIL}`,
  ].join("\n");
}

/** Shares the app with a friend on WhatsApp. */
export function shareOnWhatsApp() {
  window.open(whatsappShare(shareMessage()), "_blank");
}

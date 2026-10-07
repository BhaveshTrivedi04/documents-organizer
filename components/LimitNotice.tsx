"use client";

import Icon from "@/components/Icon";
import { whatsappToUs } from "@/lib/contact";
import { PLANS, rupees } from "@/lib/plan";

/** WhatsApp link asking us to upgrade this copy of the app to Premium. */
export function upgradeLink(): string {
  return whatsappToUs(
    `Hi, I'd like to upgrade our Family Documents app to Premium (${rupees(PLANS.premium.price)}, unlimited documents and all future updates).\n\nOur app: ${window.location.origin}`,
  );
}

/** Shown when a save is refused because the plan's document limit is reached. */
export default function LimitNotice({ message }: { message: string }) {
  return (
    <div className="warning">
      <div className="warning-title">
        <Icon name="alert" size={17} /> Document limit reached
      </div>
      <div className="hint">{message}</div>
      <div className="warning-actions">
        <a className="btn small primary" href={upgradeLink()} target="_blank" rel="noreferrer">
          <Icon name="chat" size={16} /> Upgrade to Premium
        </a>
      </div>
    </div>
  );
}

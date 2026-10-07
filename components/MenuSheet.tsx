"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { upgradeLink } from "@/components/LimitNotice";
import { COMPANY, CONTACT_EMAIL, CONTACT_NAME, CONTACT_PHONE, buyUrl, whatsappShare, whatsappToUs } from "@/lib/contact";
import type { Doc } from "@/lib/docs";
import { PLANS, rupees, type Plan } from "@/lib/plan";

type Props = {
  docs: Doc[];
  plan: Plan;
  onClose: () => void;
  onLogout: () => void;
};

const TOPICS = ["Suggestion", "Problem", "Question", "Remark"] as const;
const SENDER_KEY = "family-docs-sender";

/** Plan, messages to us, sharing with friends and logging out. */
export default function MenuSheet({ docs, plan, onClose, onLogout }: Props) {
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("Suggestion");
  const [message, setMessage] = useState("");
  const [sender, setSender] = useState(() => {
    try {
      return localStorage.getItem(SENDER_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const people = Array.from(new Set(docs.map((d) => d.person))).sort();
  const usedPercent = plan.total ? Math.min(100, (docs.length / plan.total) * 100) : 0;

  function sendMessage() {
    try {
      localStorage.setItem(SENDER_KEY, sender.trim());
    } catch {}
    const lines = [`*Family Documents: ${topic}*`];
    if (sender.trim()) lines.push(`From: ${sender.trim()}`);
    lines.push("", message.trim(), "", `App: ${window.location.origin} (${plan.label} plan)`);
    window.open(whatsappToUs(lines.join("\n")), "_blank");
  }

  // The sheet only opens after a tap, so `window` is always there.
  const shareText = [
    `I keep all my family's important papers (Aadhaar, PAN, policies, reports…) safe in one private app on my phone, and find any of them in seconds. It's made by ${COMPANY}.`,
    "",
    `Get it for your family: ${buyUrl()}`,
    `Or message ${CONTACT_NAME} on WhatsApp: ${whatsappToUs("Hi, I'd like to know more about the Family Documents app.")}`,
    `Phone: ${CONTACT_PHONE} · Email: ${CONTACT_EMAIL}`,
  ].join("\n");

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-head">
          <button className="round-btn" onClick={onClose} aria-label="Close">
            <Icon name="back" />
          </button>
          <div className="sheet-title">
            <h2 className="serif">More</h2>
            <div className="sheet-sub">Family Documents by {COMPANY}</div>
          </div>
        </div>

        {/* ----- Plan ----- */}
        <section className="panel">
          <div className="panel-title">
            <Icon name="star" size={17} /> {plan.label} plan
            {plan.key === "premium" && <span className="tag">Unlimited</span>}
          </div>
          {plan.total !== null ? (
            <>
              <div className="plan-usage">
                <strong>{docs.length}</strong> of {plan.total} documents used
              </div>
              <div className="storage-bar" aria-hidden="true">
                <div style={{ width: `${Math.max(usedPercent, docs.length ? 2 : 0)}%` }} />
              </div>
              {plan.perPerson !== null && people.length > 0 && (
                <div className="plan-people">
                  {people.map((p) => {
                    const n = docs.filter((d) => d.person === p).length;
                    return (
                      <span key={p} className={n >= plan.perPerson! ? "full" : ""}>
                        {p} {n}/{plan.perPerson}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="hint">
                Up to {plan.perPerson} documents per person. Premium has no limits and gets every new feature.
              </div>
              <a className="btn primary block plan-upgrade" href={upgradeLink()} target="_blank" rel="noreferrer">
                <Icon name="chat" size={17} /> Upgrade to Premium · {rupees(PLANS.premium.price)}
              </a>
            </>
          ) : (
            <div className="hint" style={{ marginTop: 0 }}>
              Save as many documents as you like, and every new feature comes to you automatically.
            </div>
          )}
        </section>

        {/* ----- Message us ----- */}
        <section className="field">
          <span className="label">Suggestions &amp; help</span>
          <div className="chip-wrap" style={{ marginTop: 0, marginBottom: 10 }}>
            {TOPICS.map((t) => (
              <button key={t} type="button" className={`chip small ${topic === t ? "active" : ""}`} onClick={() => setTopic(t)}>
                {t}
              </button>
            ))}
          </div>
          <textarea
            className="input textarea"
            placeholder={
              topic === "Problem"
                ? "What went wrong? e.g. The photo didn't upload"
                : topic === "Question"
                  ? "What would you like to know?"
                  : "What would make the app better for you?"
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <input
            className="input"
            style={{ marginTop: 10 }}
            placeholder="Your name (optional)"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            autoComplete="name"
          />
          <button className="btn block" style={{ marginTop: 10 }} onClick={sendMessage} disabled={!message.trim()}>
            <Icon name="chat" size={17} /> Send on WhatsApp
          </button>
          <div className="hint">WhatsApp opens with your message typed in. Just tap send.</div>
        </section>

        {/* ----- Share ----- */}
        <section className="field">
          <span className="label">Share with friends</span>
          <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
            Send friends a short note about the app with our contact details, so they can get it for their family too.
          </div>
          <div className="pick-row">
            <a className="btn" href={whatsappShare(shareText)} target="_blank" rel="noreferrer">
              <Icon name="heart" size={17} /> WhatsApp
            </a>
            <button
              className="btn"
              onClick={() => navigator.share?.({ text: shareText }).catch(() => {})}
              disabled={!("share" in navigator)}
            >
              <Icon name="share" size={17} /> Other apps
            </button>
          </div>
        </section>

        {/* ----- Contact ----- */}
        <section className="panel contact-card">
          <div className="panel-title">{COMPANY}</div>
          <a href={whatsappToUs("Hi, I need help with the Family Documents app.")} target="_blank" rel="noreferrer">
            <Icon name="chat" size={16} /> WhatsApp {CONTACT_NAME}
          </a>
          <a href={`tel:+91${CONTACT_PHONE.replace(/\s/g, "")}`}>
            <Icon name="phone" size={16} /> {CONTACT_PHONE}
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`}>
            <Icon name="mail" size={16} /> {CONTACT_EMAIL}
          </a>
        </section>

        <button className="btn ghost block" onClick={onLogout}>
          <Icon name="logout" size={17} /> Log out
        </button>
      </div>
    </div>
  );
}

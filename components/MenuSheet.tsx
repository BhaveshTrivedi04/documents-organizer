"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { upgradeLink } from "@/components/LimitNotice";
import { COMPANY, CONTACT_EMAIL, CONTACT_PHONE, shareMessage, shareOnWhatsApp, whatsappToUs } from "@/lib/contact";
import type { Doc } from "@/lib/docs";
import { PLANS, rupees, type Plan } from "@/lib/plan";

type Props = {
  docs: Doc[];
  plan: Plan;
  onClose: () => void;
  onLogout: () => void;
  /** Open with the suggestion box ready to type in. */
  focusMessage?: boolean;
};

const TOPICS = ["Suggestion", "Problem", "Question", "Remark"] as const;
const SENDER_KEY = "family-docs-sender";

/** Plan, messages to us, sharing with friends and logging out. */
export default function MenuSheet({ docs, plan, onClose, onLogout, focusMessage }: Props) {
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("Suggestion");
  const [message, setMessage] = useState("");
  const [sender, setSender] = useState(() => {
    try {
      return localStorage.getItem(SENDER_KEY) ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (!focusMessage) return;
    const box = messageRef.current;
    box?.scrollIntoView({ block: "center" });
    box?.focus({ preventScroll: true });
  }, [focusMessage]);

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
            ref={messageRef}
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
            <button className="btn" onClick={shareOnWhatsApp}>
              <Icon name="heart" size={17} /> WhatsApp
            </button>
            <button
              className="btn"
              onClick={() => navigator.share?.({ text: shareMessage() }).catch(() => {})}
              disabled={!("share" in navigator)}
            >
              <Icon name="share" size={17} /> Other apps
            </button>
          </div>
        </section>

        {/* ----- Contact ----- */}
        <section className="panel contact-card">
          <div className="contact-head">
            <strong>{COMPANY}</strong>
            <span>
              {CONTACT_PHONE} · {CONTACT_EMAIL}
            </span>
          </div>
          <div className="contact-actions">
            <a href={whatsappToUs("Hi, I need help with the Family Documents app.")} target="_blank" rel="noreferrer">
              <Icon name="chat" size={20} />
              WhatsApp
            </a>
            <a href={`tel:+91${CONTACT_PHONE.replace(/\s/g, "")}`}>
              <Icon name="phone" size={20} />
              Call
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`}>
              <Icon name="mail" size={20} />
              Email
            </a>
          </div>
        </section>

        <button className="btn ghost block" onClick={onLogout}>
          <Icon name="logout" size={17} /> Log out
        </button>
      </div>
    </div>
  );
}

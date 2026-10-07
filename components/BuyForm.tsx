"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { COMPANY, CONTACT_EMAIL, CONTACT_NAME, CONTACT_PHONE, whatsappToUs } from "@/lib/contact";
import { PLANS, rupees, type PlanKey } from "@/lib/plan";

/** Names can be in any script here (Gujarati, Hindi…), so only tidy the spaces. */
const tidy = (value: string) => value.replace(/\s+/g, " ").trim();

const BENEFITS = [
  { icon: "shield", text: "Private: only your family can open it, with your own password" },
  { icon: "search", text: "Find any paper in seconds, even if you spell it “adhar”" },
  { icon: "camera", text: "Snap a photo; front and back are saved as one PDF" },
  { icon: "share", text: "Send the actual file on WhatsApp in one tap, anywhere" },
] as const;

/** Plan choice, family details and payment, sent to us on WhatsApp. */
export default function BuyForm({ upiId }: { upiId: string }) {
  const [planKey, setPlanKey] = useState<PlanKey>("premium");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [city, setCity] = useState("");
  const [members, setMembers] = useState(["", "", "", ""]);
  const [payment, setPayment] = useState<"UPI" | "Cash">("UPI");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const plan = PLANS[planKey];
  const digits = mobile.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  const memberNames = members.map(tidy).filter(Boolean);
  // Spaces must be %20: some UPI apps show "+" literally.
  const upiLink = upiId
    ? "upi://pay?" +
      Object.entries({ pa: upiId, pn: COMPANY, am: String(plan.price), cu: "INR", tn: `Family Documents ${plan.label}` })
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&")
    : "";

  function setMember(index: number, value: string) {
    setMembers(members.map((m, i) => (i === index ? value : m)));
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!tidy(name)) return setError("Please type your name.");
    if (digits.length !== 10) return setError("Please type a 10-digit mobile number.");
    if (memberNames.length === 0) return setError("Please add at least one family member.");
    setError("");

    const text = [
      "*New order: Family Documents*",
      `Plan: ${plan.label} (${rupees(plan.price)})`,
      "",
      `Name: ${tidy(name)}`,
      `Mobile: ${digits}`,
      ...(tidy(city) ? [`City: ${tidy(city)}`] : []),
      "",
      "Family members:",
      ...memberNames.map((m, i) => `${i + 1}. ${m}`),
      "",
      `Payment: ${payment}`,
    ];
    window.open(whatsappToUs(text.join("\n")), "_blank");
    setSent(true);
  }

  return (
    <main className="buy">
      <header className="buy-brand">
        <img src="/icon.svg" alt="" />
        <span>
          <strong>Family Documents</strong>
          <small>by {COMPANY}</small>
        </span>
      </header>

      <section className="buy-hero">
        <h1 className="serif">Every family paper, one calm place</h1>
        <p>Aadhaar, PAN, policies, certificates and bills, safe in one private app on every phone at home.</p>
      </section>

      <ul className="buy-benefits">
        {BENEFITS.map((b) => (
          <li key={b.text} className="glass">
            <span className="type-icon">
              <Icon name={b.icon} size={19} />
            </span>
            {b.text}
          </li>
        ))}
      </ul>

      <form className="buy-form" onSubmit={send}>
        <h2 className="serif">1. Choose a plan</h2>
        <div className="buy-plans" role="radiogroup" aria-label="Plan">
          {(["basic", "premium"] as const).map((key) => {
            const p = PLANS[key];
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={planKey === key}
                className={`buy-plan glass ${planKey === key ? "on" : ""}`}
                onClick={() => setPlanKey(key)}
              >
                {key === "premium" && <span className="buy-best">Best value</span>}
                <span className="buy-plan-name">{p.label}</span>
                <span className="buy-price serif">{rupees(p.price)}</span>
                <span className="buy-once">one-time</span>
                <span className="buy-points">
                  {p.total === null ? (
                    <>
                      <span>Unlimited documents</span>
                      <span>All future updates</span>
                    </>
                  ) : (
                    <>
                      <span>Up to {p.total} documents</span>
                      <span>{p.perPerson} per person</span>
                      <span>Today’s features only</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <h2 className="serif">2. Your details</h2>
        <div className="buy-fields">
          <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <input
            className="input"
            placeholder="Mobile number"
            inputMode="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            autoComplete="tel"
          />
          <input className="input" placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>

        <h2 className="serif">3. Family members</h2>
        <p className="hint" style={{ marginTop: -6, marginBottom: 10 }}>
          Whose documents will you keep? Each person gets their own section in the app.
        </p>
        <div className="buy-fields">
          {members.map((m, i) => (
            <input
              key={i}
              className="input"
              placeholder={["e.g. Mom", "e.g. Dad", "e.g. Riya", "Another member"][i] ?? "Another member"}
              value={m}
              onChange={(e) => setMember(i, e.target.value)}
            />
          ))}
          <button type="button" className="btn ghost small" onClick={() => setMembers([...members, ""])}>
            <Icon name="plus" size={16} /> Add another member
          </button>
        </div>

        <h2 className="serif">4. Payment</h2>
        <div className="pick-row">
          {(["UPI", "Cash"] as const).map((p) => (
            <button key={p} type="button" className={`btn ${payment === p ? "selected" : ""}`} onClick={() => setPayment(p)}>
              {p}
            </button>
          ))}
        </div>
        <p className="hint">
          {payment === "Cash"
            ? "Pay in cash when we set up the app for you."
            : upiId
              ? `Pay ${rupees(plan.price)} to UPI ID ${upiId}, then send us your details below.`
              : "We’ll send our UPI details on WhatsApp."}
        </p>
        {payment === "UPI" && upiLink && (
          <a className="btn block" href={upiLink} style={{ marginTop: 10 }}>
            Pay {rupees(plan.price)} with a UPI app
          </a>
        )}

        {error && (
          <div className="error" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}
        <button className="btn primary block" style={{ marginTop: 18 }}>
          <Icon name="chat" size={18} /> Send details on WhatsApp
        </button>
        {sent && (
          <p className="hint" style={{ textAlign: "center" }}>
            WhatsApp should open with your details typed in. Tap send, and we’ll set up your app.
          </p>
        )}
      </form>

      <footer className="buy-contact">
        <strong>{COMPANY}</strong>
        <span>
          Questions? {CONTACT_NAME} · <a href={`tel:+91${CONTACT_PHONE.replace(/\s/g, "")}`}>{CONTACT_PHONE}</a> ·{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </span>
      </footer>
    </main>
  );
}

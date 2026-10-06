"use client";

import Icon from "@/components/Icon";
import { CATEGORIES, DEFAULT_PERSON, cleanName, type CategoryKey } from "@/lib/docs";

type Props = {
  name: string;
  onName: (value: string) => void;
  person: string;
  onPerson: (value: string) => void;
  category: CategoryKey;
  onCategory: (value: CategoryKey) => void;
  /** People already used in saved documents, offered as quick choices. */
  persons: string[];
  disabled?: boolean;
  /** Number for the first label ("2. Name"), or omit for plain labels. */
  firstStep?: number;
  /** Shown between the person and type fields (e.g. a same-name warning). */
  afterPerson?: React.ReactNode;
};

/** The name / whose / type fields shared by the add, edit and merge screens. */
export default function DetailsFields({
  name,
  onName,
  person,
  onPerson,
  category,
  onCategory,
  persons,
  disabled,
  firstStep,
  afterPerson,
}: Props) {
  const step = (offset: number, label: string) => (firstStep ? `${firstStep + offset}. ${label}` : label);
  const finalPerson = cleanName(person) || DEFAULT_PERSON;
  const personChoices = Array.from(new Set([DEFAULT_PERSON, ...persons])).filter(Boolean);

  return (
    <>
      <div className="field">
        <label className="label" htmlFor="doc-name">
          {step(0, "Name")}
        </label>
        <input
          id="doc-name"
          className="input"
          placeholder="e.g. Aadhar Card"
          value={name}
          onChange={(e) => onName(e.target.value)}
          autoCapitalize="words"
          autoComplete="off"
          disabled={disabled}
        />
        {cleanName(name) && cleanName(name) !== name.trim() && (
          <div className="hint">
            Will be saved as <strong>{cleanName(name)}</strong>
          </div>
        )}
      </div>

      <div className="field">
        <span className="label">{step(1, "Whose document?")}</span>
        <input
          className="input"
          placeholder="Select from below or type new"
          value={person}
          onChange={(e) => onPerson(e.target.value)}
          autoCapitalize="words"
          autoComplete="off"
          disabled={disabled}
        />
        {cleanName(person) && cleanName(person) !== person.trim() && (
          <div className="hint">
            Will be saved as <strong>{cleanName(person)}</strong>
          </div>
        )}
        <div className="chip-wrap">
          {personChoices.map((p) => (
            <button
              key={p}
              className={`chip small ${finalPerson === p ? "active" : ""}`}
              onClick={() => onPerson(p === DEFAULT_PERSON ? "" : p)}
              disabled={disabled}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {afterPerson}

      <div className="field">
        <span className="label">{step(2, "Category")}</span>
        <div className="cat-grid">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`cat-btn ${category === c.key ? "active" : ""}`}
              onClick={() => onCategory(c.key)}
              disabled={disabled}
            >
              <Icon name={c.icon} size={22} />
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

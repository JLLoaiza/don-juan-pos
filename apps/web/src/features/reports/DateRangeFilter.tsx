import { useState } from "react";

export interface DateRangeValue {
  readonly from: string | undefined;
  readonly to: string | undefined;
}

type PresetKey = "today" | "yesterday" | "last7" | "thisMonth" | "all";

const PRESET_LABEL: Record<PresetKey, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  last7: "Últimos 7 días",
  thisMonth: "Este mes",
  all: "Todo",
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// [from, to) — half-open, per .agents/reports-dashboard-exports.md §5.
// Computed in the browser's local time zone: the branch's own time zone is
// not exposed to this contract, so "today" means today where the browser is.
function computePreset(preset: Exclude<PresetKey, "all">): DateRangeValue {
  const today = startOfDay(new Date());
  switch (preset) {
    case "today":
      return { from: today.toISOString(), to: addDays(today, 1).toISOString() };
    case "yesterday":
      return { from: addDays(today, -1).toISOString(), to: today.toISOString() };
    case "last7":
      return { from: addDays(today, -6).toISOString(), to: addDays(today, 1).toISOString() };
    case "thisMonth": {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.toISOString(), to: addDays(today, 1).toISOString() };
    }
  }
}

function toDateInputValue(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function initialDateRange(): DateRangeValue {
  return computePreset("today");
}

export interface DateRangeFilterProps {
  readonly value: DateRangeValue;
  readonly onChange: (value: DateRangeValue) => void;
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [preset, setPreset] = useState<PresetKey | "custom">("today");

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    onChange(key === "all" ? { from: undefined, to: undefined } : computePreset(key));
  };

  const handleFromChange = (raw: string) => {
    setPreset("custom");
    onChange({ ...value, from: raw ? startOfDay(new Date(`${raw}T00:00:00`)).toISOString() : undefined });
  };

  const handleToChange = (raw: string) => {
    setPreset("custom");
    onChange({ ...value, to: raw ? addDays(startOfDay(new Date(`${raw}T00:00:00`)), 1).toISOString() : undefined });
  };

  return (
    <div className="dj-reports__filters">
      <div className="dj-reports__presets" role="group" aria-label="Rango de fechas predefinido">
        {(Object.keys(PRESET_LABEL) as PresetKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`dj-reports__preset${preset === key ? " dj-reports__preset--active" : ""}`}
            onClick={() => applyPreset(key)}
          >
            {PRESET_LABEL[key]}
          </button>
        ))}
      </div>
      <div className="dj-reports__custom-range">
        <label>
          <span>Desde</span>
          <input type="date" value={toDateInputValue(value.from)} onChange={(event) => handleFromChange(event.target.value)} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" value={toDateInputValue(value.to)} onChange={(event) => handleToChange(event.target.value)} />
        </label>
      </div>
    </div>
  );
}

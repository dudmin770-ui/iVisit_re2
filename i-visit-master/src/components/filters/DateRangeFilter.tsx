interface DateRangeFilterProps {
  label?: string;
  fromValue: string;
  toValue: string;
  min?: string;
  max?: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

export default function DateRangeFilter({
  label,
  fromValue,
  toValue,
  min,
  max,
  onFromChange,
  onToChange,
}: DateRangeFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {label && <span className="text-slate-300">{label}:</span>}

      <div className="flex items-center gap-2">
        {/* FROM */}
        <div className="flex items-center gap-1 text-xs md:text-sm">
          <span className="text-slate-400">From</span>
          <input
            type="date"
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs md:text-sm text-white"
            value={fromValue}
            min={min}
            max={max}
            onChange={(e) => onFromChange(e.target.value)}
          />
        </div>

        {/* TO */}
        <div className="flex items-center gap-1 text-xs md:text-sm">
          <span className="text-slate-400">To</span>
          <input
            type="date"
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs md:text-sm text-white"
            value={toValue}
            min={min}
            max={max}
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
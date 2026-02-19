import { useState } from "react";
import Input from "../common/Input";
import Button from "../common/Button";
import Select from "../common/Select";
import DateRangeFilter from "./DateRangeFilter";


export interface FilterOption {
    label: string;
    value: string;
}

type SelectFilterConfig = {
    id: string;
    label: string;
    type: "select";
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
};

type DateRangeFilterConfig = {
    id: string;
    label: string;
    type: "dateRange";
    fromValue: string;
    toValue: string;
    min?: string;
    max?: string;
    onFromChange: (value: string) => void;
    onToChange: (value: string) => void;
};

export type FilterConfig = SelectFilterConfig | DateRangeFilterConfig;

interface FilterHeaderProps {
    title: string;
    subtitle?: string;

    searchValue: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;

    filters?: FilterConfig[];

    actions?: React.ReactNode;
}

export default function FilterHeader({
    title,
    subtitle,
    searchValue,
    onSearchChange,
    searchPlaceholder = "Search...",
    filters = [],
    actions,
}: FilterHeaderProps) {
    const [open, setOpen] = useState(false); // filters collapsed by default

    return (
        <div className="mb-4 space-y-3">
            {/* Top row: title + search + Filters toggle */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                {/* Left: title */}
                <div>
                    <p className="text-xl">{title}</p>
                    {subtitle && (
                        <p className="text-xs text-slate-400">{subtitle}</p>
                    )}
                </div>

                {/* Right: search + Filters button + actions row */}
                <div className="w-full md:w-auto flex flex-col gap-2">
                    {actions && (
                        <div className="flex flex-wrap gap-2 justify-start md:justify-end">
                            {actions}
                        </div>
                    )}
                    <div className="flex items-center gap-2 w-full">
                        {filters.length > 0 && (
                            <Button
                                variation="secondary"
                                className="text-xs px-3 py-1 whitespace-nowrap"
                                type="button"
                                onClick={() => setOpen((prev) => !prev)}
                            >
                                {open ? "Hide filters" : "Filters"}
                            </Button>
                        )}
                        <Input
                            className="text-dark-gray w-full md:w-64 lg:w-80"
                            placeholder={searchPlaceholder}
                            value={searchValue}
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Filters row – only when open */}
            {filters.length > 0 && open && (
                <div className="flex flex-wrap gap-3 text-xs md:text-sm bg-black/20 border border-white/10 rounded-md p-3 backdrop-blur-sm">
                    {filters.map((f) => {
                        if (f.type === "select") {
                            return (
                                <div key={f.id} className="flex items-center gap-1">
                                    <span className="text-slate-300 whitespace-nowrap">
                                        {f.label}:
                                    </span>
                                    <Select
                                        id={`filter-${f.id}`}
                                        value={f.value}
                                        options={f.options}
                                        className="w-40 md:w-44"
                                        onChange={f.onChange}
                                    />
                                </div>
                            );
                        }

                        // dateRange
                        return (
                            <DateRangeFilter
                                key={f.id}
                                label={f.label}
                                fromValue={f.fromValue}
                                toValue={f.toValue}
                                min={f.min}
                                max={f.max}
                                onFromChange={f.onFromChange}
                                onToChange={f.onToChange}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}
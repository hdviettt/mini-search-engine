"use client";

interface ParameterSliderProps {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  description: string;
  onChange: (value: number) => void;
}

export default function ParameterSlider({
  label, value, defaultValue, min, max, step, description, onChange,
}: ParameterSliderProps) {
  const isDefault = Math.abs(value - defaultValue) < step;
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-rose-400 tabular-nums">{value.toFixed(2)}</span>
          {!isDefault && (
            <button
              onClick={() => onChange(defaultValue)}
              className="text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer px-1.5 py-0.5 rounded border border-[#2a2a4a] hover:border-gray-600 transition-colors"
            >
              reset
            </button>
          )}
        </div>
      </div>

      {/* Custom slider track */}
      <div className="relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-1.5 bg-[#1a1a3a] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-rose-600/60 to-rose-500/40 rounded-full transition-all duration-100"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {/* Thumb indicator */}
        <div
          className="absolute w-3.5 h-3.5 bg-rose-500 rounded-full shadow-lg shadow-rose-500/20 border-2 border-[#0a0a1a] pointer-events-none transition-all duration-100"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
        {/* Default marker */}
        {!isDefault && (
          <div
            className="absolute w-0.5 h-3 bg-gray-600/50 rounded-full pointer-events-none"
            style={{ left: `${((defaultValue - min) / (max - min)) * 100}%` }}
          />
        )}
      </div>

      <div className="flex justify-between text-[10px] text-gray-700 mt-1">
        <span>{min}</span>
        <span className="text-gray-600">{description}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

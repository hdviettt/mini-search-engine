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

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-rose-400">{value.toFixed(2)}</span>
          {!isDefault && (
            <button
              onClick={() => onChange(defaultValue)}
              className="text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer"
            >
              reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-[#1a1a3a] rounded-lg appearance-none cursor-pointer accent-rose-500"
      />
      <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
        <span>{min}</span>
        <span className="text-gray-700">{description}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

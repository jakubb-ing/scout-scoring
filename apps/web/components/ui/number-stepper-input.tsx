"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fastStepFor } from "@/lib/scoring/point-step";
import { cn } from "@/lib/utils";

type NumericInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "max" | "min" | "step" | "type">;

export type NumberStepperInputProps = NumericInputProps & {
  /**
   * Maximální hodnota (inclusive).
   */
  max: number;

  /**
   * Krok jednoho kliknutí a validace inputu (1, 0.5, 0.25). Default 1.
   */
  step?: number;
};

const min = 0;

const NumberStepperInput = React.forwardRef<HTMLInputElement, NumberStepperInputProps>(
  (
    { className, disabled, step = 1, max, onBlur, onChange, readOnly, style, value, defaultValue, ...props },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [uncontrolledValue, setUncontrolledValue] = React.useState(() => String(defaultValue ?? min));
    const isControlled = value !== undefined;
    const inputValue = isControlled ? value : uncontrolledValue;
    const fastStep = fastStepFor(max, step);
    const currentValue = clamp(toNumber(inputValue), min, max);
    const progress = max > min ? ((currentValue - min) / (max - min)) * 100 : 0;
    const controlsDisabled = disabled || readOnly;

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    function setValue(nextValue: number) {
      const next = formatNumber(clamp(nextValue, min, max));

      if (!isControlled) {
        setUncontrolledValue(next);
      }

      const input = inputRef.current;
      if (!input) {
        return;
      }

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeInputValueSetter?.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function handleStep(delta: number) {
      setValue(currentValue + delta);
    }

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      if (!isControlled) {
        setUncontrolledValue(event.target.value);
      }

      onChange?.(event);
    }

    function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
      const next = formatNumber(clamp(toNumber(event.target.value), min, max));

      if (event.target.value !== next) {
        setValue(Number(next));
      }

      onBlur?.(event);
    }

    return (
      <div className="flex w-full items-center gap-2">
        {fastStep ? (
          <StepButton
            amount={-fastStep}
            disabled={controlsDisabled || currentValue <= min}
            onClick={() => handleStep(-fastStep)}
          />
        ) : null}
        <StepButton amount={-step} disabled={controlsDisabled || currentValue <= min} onClick={() => handleStep(-step)} />
        <Input
          ref={inputRef}
          type="number"
          inputMode={step < 1 ? "decimal" : "numeric"}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          readOnly={readOnly}
          value={inputValue}
          onBlur={handleBlur}
          onChange={handleChange}
          className={cn(
            "min-w-20 text-center font-semibold tabular-nums",
            "bg-[linear-gradient(90deg,var(--stepper-progress)_0%,var(--stepper-progress)_var(--stepper-progress-width),white_var(--stepper-progress-width),white_100%)]",
            className
          )}
          style={
            {
              "--stepper-progress": "rgb(219 234 254)",
              "--stepper-progress-width": `${progress}%`,
              ...style,
            } as React.CSSProperties
          }
          {...props}
        />
        <StepButton amount={step} disabled={controlsDisabled || currentValue >= max} onClick={() => handleStep(step)} />
        {fastStep ? (
          <StepButton
            amount={fastStep}
            disabled={controlsDisabled || currentValue >= max}
            onClick={() => handleStep(fastStep)}
          />
        ) : null}
      </div>
    );
  }
);
NumberStepperInput.displayName = "NumberStepperInput";

/**
 * Tlačítko kroku. Ikona plus/minus tu původně byla, ale i s mezerou
 * ujídala 24 px, takže se vedle ní popisek „0,25“ tísnil. Znaménko je
 * proto součástí textu: zabere jeden znak a na rozdíl od pouhé barvy
 * ho pozná i ten, kdo červenou od zelené nerozliší.
 *
 * Šířka je pevná, aby řada nebyla roztřepená podle toho, jak dlouhé
 * číslo zrovna vyšlo. Vejde se do ní i nejširší reálný případ, pět
 * znaků jako „−18,5“.
 */
function StepButton({
  amount,
  disabled,
  onClick,
}: {
  amount: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  const isSubtract = amount < 0;
  const label = formatStepLabel(Math.abs(amount));

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      aria-label={isSubtract ? `Odebrat ${label}` : `Přidat ${label}`}
      className={cn(
        "h-10 w-13 shrink-0 gap-0.5 px-1 text-13 tabular-nums",
        isSubtract
          ? "border-scout-red-border bg-scout-red-soft text-scout-red-deep hover:bg-scout-red/15 hover:text-scout-red-deep"
          : "border-scout-green-border bg-scout-green-soft text-scout-green-deep hover:bg-scout-green/15 hover:text-scout-green-deep"
      )}
    >
      {/* U+2212 je typografické minus, ne spojovník: má šířku číslice,
          takže se znaménka na obou stranách opticky srovnají. */}
      <span aria-hidden="true">{isSubtract ? "\u2212" : "+"}</span>
      {label}
    </Button>
  );
}

function toNumber(value: React.InputHTMLAttributes<HTMLInputElement>["value"]) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : min;
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

// Pozor, dvě formátování se záměrně liší. `formatNumber` plní `value`
// číselného inputu, kam patří tečka — s čárkou by input hodnotu zahodil.
// `formatStepLabel` je jen text na tlačítku, a ten je česky.
function formatNumber(value: number) {
  return String(value);
}

function formatStepLabel(value: number) {
  return String(value).replace(".", ",");
}

export { NumberStepperInput };

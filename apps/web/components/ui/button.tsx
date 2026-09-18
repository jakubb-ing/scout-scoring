import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-8 text-13 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Bez `!` u text-white: `!important` přebije i barvu, kterou volající
        // pošle v `className`, takže `bg-white text-scout-blue` skončilo jako
        // bílý text na bílém pozadí. tailwind-merge si s konfliktem poradí
        // sám — když volající barvu nepošle, zůstane bílá.
        default: "border border-transparent bg-scout-blue text-white hover:bg-scout-blue-mid",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border-1.5 border-scout-border bg-white text-scout-text-secondary hover:bg-scout-bg-subtle hover:text-scout-text",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-secondary hover:text-secondary-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        accent: "border border-transparent bg-scout-yellow text-scout-text hover:bg-scout-amber",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-8 px-3 text-12",
        lg: "h-11 rounded-10 px-5 text-15",
        xl: "h-14 rounded-12 px-8 text-17",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

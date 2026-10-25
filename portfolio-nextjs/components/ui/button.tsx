/**
 * Button component - shadcn/ui style
 *
 * A reusable button component with variant support and hover states.
 */

import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-accent/20 hover:text-accent",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}) {
  const VariantClass = variants[variant as keyof typeof variants] || variants.default;
  const SizeClass = {
    default: "py-2 px-4 text-sm",
    sm: "py-1.5 px-3 text-sm",
    lg: "py-3 px-6 text-base",
    icon: "h-10 w-10",
  }[size as keyof typeof SizeClass] || SizeClass.default;

  if (asChild) {
    const Component = props.asChild || "button";
    return <Component className={cn(SizeClass, className)} {...props} />;
  }

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center",
        SizeClass,
        VariantClass,
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        disabled && "opacity-50 cursor-not-enabled",
        className
      )}
      {...props}
    />
  );
});

Button.displayName = "Button";
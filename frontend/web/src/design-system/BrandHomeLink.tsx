import type { MouseEventHandler } from "react";
import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { cn } from "./utils";

type BrandHomeLinkProps = {
  size?: "xs" | "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
  brandClassName?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function BrandHomeLink({
  size = "sm",
  showWordmark = true,
  className,
  brandClassName,
  onClick,
}: BrandHomeLinkProps) {
  return (
    <Link
      to="/"
      aria-label="На главную"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        className,
      )}
    >
      <BrandMark size={size} showWordmark={showWordmark} className={brandClassName} />
    </Link>
  );
}

import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

type UpvBrandProps = {
  className?: string;
  href?: string;
  productName?: string;
  /** Versión estrecha para la barra lateral y la cabecera del móvil. */
  compact?: boolean;
};

export function UpvBrand({
  className,
  href = "/",
  productName = "Evalúa",
  compact = false,
}: UpvBrandProps) {
  return (
    <Link
      aria-label={`${productName} · Universitat Politècnica de València`}
      className={cn(
        "inline-flex min-w-0 items-center gap-3 text-upv-ink dark:text-white",
        className,
      )}
      href={href}
    >
      <Image
        alt="Universitat Politècnica de València"
        className={cn("w-auto shrink-0 dark:hidden", compact ? "h-8" : "h-10 sm:h-12")}
        height={119}
        priority
        src="/brand/upv/upv-primary-color.svg"
        width={369}
      />
      <Image
        alt=""
        aria-hidden="true"
        className={cn("hidden w-auto shrink-0 dark:block", compact ? "h-8" : "h-10 sm:h-12")}
        height={119}
        priority
        src="/brand/upv/upv-primary-white.png"
        width={369}
      />
      <span aria-hidden="true" className={cn("w-px shrink-0 bg-upv-300", compact ? "h-6" : "h-9")} />
      <span className={cn("truncate font-heading font-bold", compact ? "text-base" : "text-base sm:text-lg")}>
        {productName}
      </span>
    </Link>
  );
}

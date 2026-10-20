import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

type UpvBrandProps = {
  className?: string;
  href?: string;
  productName?: string;
};

export function UpvBrand({
  className,
  href = "/",
  productName = "Evalúa",
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
        className="h-10 w-auto shrink-0 dark:hidden sm:h-12"
        height={119}
        priority
        src="/brand/upv/upv-primary-color.svg"
        width={369}
      />
      <Image
        alt=""
        aria-hidden="true"
        className="hidden h-10 w-auto shrink-0 dark:block sm:h-12"
        height={119}
        priority
        src="/brand/upv/upv-primary-white.png"
        width={369}
      />
      <span aria-hidden="true" className="h-9 w-px shrink-0 bg-upv-300" />
      <span className="truncate font-heading text-base font-bold sm:text-lg">
        {productName}
      </span>
    </Link>
  );
}

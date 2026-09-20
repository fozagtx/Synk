import Image from "next/image";
import Link from "next/link";

export function SiteNav({ variant }: { variant: "dark" | "light" }) {
  const dark = variant === "dark";

  return (
    <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link
        href="/"
        className={`inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight ${
          dark ? "text-white" : "text-ink"
        }`}
      >
        <Image
          src="/brand-logo.svg"
          alt=""
          width={30}
          height={30}
          priority
        />
        <span>
          Synk<span className={dark ? "text-tertiary" : "text-primary"}>.</span>
        </span>
      </Link>
      <span
        className={`text-xs uppercase tracking-[0.18em] ${
          dark ? "text-white/60" : "text-caption-muted"
        }`}
      >
        Vibe-Code Rescue Audit
      </span>
    </nav>
  );
}

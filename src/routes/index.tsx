import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GreenOpsLogo, ROLES } from "@/components/greenops/shell";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => seo("GreenOps OS — Choose your role", "Explore your company's digital operations."),
  component: Welcome,
});

const roleCards = {
  ceo: {
    label: "CEO",
    title: "Executive Overview",
    text: "Are we on track for −40% CO₂ and −25% cost? The three biggest opportunities and risks at a glance.",
  },
  cfo: {
    label: "CFO",
    title: "Financial Intelligence",
    text: "Costs by department, provider and service. Build a savings portfolio within the CHF 16,500 budget.",
  },
  it: {
    label: "IT Manager",
    title: "Technical Operations",
    text: "Servers, GPU, data platform and AI usage. What idles, what is protected, what to change safely.",
  },
};

function Welcome() {
  return (
    <main className="relative isolate mx-auto min-h-dvh max-w-6xl px-6 py-16 md:py-24">
      <WelcomeMap />
      <header>
        <GreenOpsLogo />
      </header>
      <section className="mt-10">
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
          How would you like to explore <span className="welcome-accent">GreenOps</span>?
        </h1>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          See where cloud, servers, AI and SaaS create costs, energy use and CO₂ — and pick safe
          measures to cut them. You can switch roles at any time; your selections stay.
        </p>
        <div className="mt-12 grid auto-rows-fr gap-5 md:grid-cols-3">
          {ROLES.map(({ id, to, Icon }) => (
            <Link
              key={id}
              to={to}
              className="card-elevated group flex min-w-0 flex-col items-start p-7 transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="grid size-12 place-items-center rounded-lg bg-accent text-accent-ink">
                <Icon className="size-5" />
              </span>
              <span className="mt-6 text-xs font-semibold uppercase tracking-wide text-accent-ink">
                {roleCards[id].label}
              </span>
              <h2 className="mt-1 text-2xl font-semibold">{roleCards[id].title}</h2>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{roleCards[id].text}</p>
              <span className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink">
                Open{" "}
                <ArrowRight
                  aria-hidden
                  className="size-4 transition-transform group-hover:translate-x-1"
                />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function WelcomeMap() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1000 480"
      className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 w-full -translate-y-1/2 text-accent-ink opacity-[0.22] dark:opacity-[0.17]"
    >
      <defs>
        <pattern id="welcome-map-dots" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="1.25" fill="currentColor" />
        </pattern>
      </defs>
      <g fill="url(#welcome-map-dots)">
        <path d="M34 103 61 82 112 81 132 61 193 57 218 73 256 57 286 77 265 104 280 123 250 135 228 172 211 174 192 200 170 201 163 218 182 243 166 246 143 224 139 201 111 189 101 164 85 149 74 123 42 128Z" />
        <path d="M277 51 314 30 348 37 344 60 327 80 325 105 294 130 282 113 291 87 265 72Z" />
        <path d="M178 237 209 237 236 254 249 275 287 291 279 319 258 347 246 376 219 410 206 424 190 414 198 385 190 353 190 324 172 297 162 273Z" />
        <path d="M387 141 401 121 426 118 420 101 446 103 452 78 479 60 493 74 485 98 504 103 525 83 514 64 547 53 580 63 628 49 653 59 696 49 732 60 798 61 823 77 873 78 918 97 956 104 968 126 926 125 903 142 873 141 846 165 839 188 807 214 784 231 777 255 798 276 782 287 751 269 737 239 717 223 692 252 674 241 663 213 633 206 614 222 587 213 577 192 552 190 528 171 504 177 489 161 469 166 450 148 436 162 406 163Z" />
        <path d="M424 170 463 165 495 178 508 201 534 213 550 236 529 261 514 300 496 332 473 343 454 314 457 281 435 254 410 246 392 221 399 194Z M541 296 553 306 544 338 532 347 529 328Z" />
        <path d="M745 278 771 285 792 293 807 287 834 295 841 308 808 310 785 301 769 305Z M822 334 846 316 880 316 899 303 925 321 940 348 929 376 903 385 882 371 847 375 824 363Z M958 380 969 386 959 411 940 420 940 409Z" />
      </g>
    </svg>
  );
}

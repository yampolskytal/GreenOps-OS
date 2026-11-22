import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GreenOpsLogo, ROLES } from "@/components/greenops/shell";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => seo("GreenOps OS — Choose your role", "Explore your company's digital operations."),
  component: Welcome,
});

const descriptions = {
  ceo: "Strategy, sustainability targets and management decisions.",
  cfo: "Digital spending, cost savings and financial planning.",
  it: "Resource efficiency, infrastructure and operational risks.",
};

function Welcome() {
  return (
    <main className="relative isolate mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-8 sm:px-10">
      <WelcomeMap />
      <header>
        <GreenOpsLogo />
      </header>
      <section className="my-auto py-12">
        <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          What's your role?
        </h1>
        <p className="mt-4 text-center text-muted-foreground">
          Choose your role to explore your company's digital operations.
        </p>
        <div className="mt-10 grid auto-rows-fr gap-4 md:grid-cols-3">
          {ROLES.map(({ id, to, label, Icon }) => (
            <Link
              key={id}
              to={to}
              className="group flex min-w-0 flex-col rounded-xl border border-[#C8FA50]/40 bg-card p-6 transition-colors hover:border-[#C8FA50] hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8FA50]"
            >
              <span className="mb-6 grid size-11 place-items-center rounded-lg bg-[#C8FA50] text-[#1a2410]">
                <Icon className="size-5" />
              </span>
              <h2 className="text-xl font-semibold">{label}</h2>
              <p className="mb-6 mt-2 text-sm text-muted-foreground">{descriptions[id]}</p>
              <ArrowRight
                aria-hidden
                className="mt-auto size-5 self-end transition-transform group-hover:translate-x-1"
              />
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

import { Eyebrow } from "./components/ui/eyebrow";
import { profiles } from "./data/profiles";
import { reviewBusinessProfile } from "./lib/moderation";

/**
 * Starter screen. Today the onboarding review results are only visible as
 * raw JSON in an internal log. The exercise is to turn this into the
 * review queue described in README.md.
 *
 * Primitives available in ./components/ui: Button, Card, Chip, Eyebrow,
 * InsightBar, Stat, StatusBadge.
 */
export function App() {
  const reviewed = profiles.map((profile) => ({
    profile,
    result: reviewBusinessProfile(profile, profile.onboardingState),
  }));

  return (
    <main className="mx-auto max-w-[var(--content-max)] px-6 py-10">
      <header className="flex flex-col gap-2">
        <Eyebrow tone="spark">Onboarding</Eyebrow>
        <h1 className="text-heading-32 text-cream">Review queue</h1>
        <p className="text-copy-14 text-muted-foreground">
          {reviewed.length} profiles checked against the restricted-industry
          policy.
        </p>
      </header>

      {/* TODO (Task 1): replace this dump with the queue. */}
      <pre className="mt-8 overflow-auto rounded-card border bg-card p-5 font-code text-[12.5px] leading-relaxed text-muted2">
        {JSON.stringify(
          reviewed.map(({ profile, result }) => ({
            id: profile.id,
            businessName: profile.businessName,
            ...result,
          })),
          null,
          2
        )}
      </pre>
    </main>
  );
}

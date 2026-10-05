import type { BusinessProfileInput, OnboardingState } from "../lib/moderation";

/**
 * Business profiles waiting in the onboarding review queue.
 * Shapes mirror `business_profile` rows; values are fictional.
 */
export interface QueuedProfile extends BusinessProfileInput {
  id: string;
  businessName: string;
  websiteUrl: string;
  industry: string;
  description: string;
  onboardingState: OnboardingState;
  /** ISO timestamp of when the profile entered the queue. */
  submittedAt: string;
}

export const profiles: readonly QueuedProfile[] = [
  {
    id: "bp_01",
    businessName: "Northwind Dental Studio",
    websiteUrl: "https://northwinddental.com",
    industry: "Healthcare",
    description:
      "Family dentistry in Portland. Cleanings, whitening and Invisalign with same-week appointments.",
    onboardingState: "IDENTIFY",
    submittedAt: "2026-10-04T09:12:00Z",
  },
  {
    id: "bp_02",
    businessName: "Stake House BBQ",
    websiteUrl: "https://stakehousebbq.com",
    industry: "Restaurants",
    description:
      "Texas-style smoked brisket and ribs. Catering for offices and weddings across Austin.",
    onboardingState: "ENRICHMENT",
    submittedAt: "2026-10-04T10:40:00Z",
  },
  {
    id: "bp_03",
    businessName: "Desk & Chair Co.",
    websiteUrl: "https://deskandchair.co",
    industry: "Office furniture",
    description:
      "Ergonomic standing desks and chairs for home offices. Free assembly in the Bay Area.",
    onboardingState: "IDENTIFY",
    submittedAt: "2026-10-03T16:05:00Z",
  },
  {
    id: "bp_04",
    businessName: "Rateboard",
    websiteUrl: "https://rateboard.app",
    industry: "Travel software",
    description:
      "Live currency exchange rates for travelers, with offline mode and a tipping calculator.",
    onboardingState: "START",
    submittedAt: "2026-10-02T08:30:00Z",
  },
  {
    id: "bp_05",
    businessName: "Lucky7 Sportsbook",
    websiteUrl: "https://lucky7.bet",
    industry: "Entertainment",
    description:
      "Daily odds on football, basketball and esports. Sign up and get a free bet.",
    onboardingState: "START",
    submittedAt: "2026-10-04T11:55:00Z",
  },
  {
    id: "bp_06",
    businessName: "Peak Trading Academy",
    websiteUrl: "https://peaktrading.academy",
    industry: "Education",
    description:
      "Video courses that teach day trading strategies for stocks and options. No account required.",
    onboardingState: "COMPLETE",
    submittedAt: "2026-09-28T14:20:00Z",
  },
  {
    id: "bp_07",
    businessName: "Vinoteca",
    websiteUrl: "https://vinoteca.shop",
    industry: "Retail",
    description:
      "Curated natural wine shop with monthly subscription boxes shipped across California.",
    onboardingState: "IDENTIFY",
    submittedAt: "2026-10-01T12:00:00Z",
  },
  {
    id: "bp_08",
    businessName: "Pawfect Pet Supplies",
    websiteUrl: "https://pawfect.store",
    industry: "Pet supplies",
    description:
      "Grain-free dog food, toys and grooming kits. Subscribe and save 15% on every order.",
    onboardingState: "ENRICHMENT",
    submittedAt: "2026-10-04T07:45:00Z",
  },
  {
    id: "bp_09",
    businessName: "Loan in a Flash",
    websiteUrl: "https://loaninaflash.com",
    industry: "Financial services",
    description:
      "Same-day instant loans up to $1,000. No credit check, money in your account within the hour.",
    onboardingState: "IDENTIFY",
    submittedAt: "2026-10-03T19:10:00Z",
  },
  {
    id: "bp_10",
    businessName: "Brightside Insurance Brokers",
    websiteUrl: "https://brightsidebrokers.com",
    industry: "Insurance",
    description:
      "Independent broker comparing home and auto insurance quotes from 20+ carriers.",
    onboardingState: "MANUAL",
    submittedAt: "2026-09-30T10:00:00Z",
  },
  {
    id: "bp_11",
    businessName: "Mint Vape Lounge",
    websiteUrl: "https://mintvapelounge.com",
    industry: "Retail",
    description:
      "Premium e-liquids and vaping hardware. In-store tasting bar open late.",
    onboardingState: "START",
    submittedAt: "2026-10-04T13:25:00Z",
  },
  {
    id: "bp_12",
    businessName: "Harbor Parts Exchange",
    websiteUrl: "https://harborpartsexchange.com",
    industry: "Marine",
    description:
      "Marketplace to buy, sell and exchange used boat parts with verified sellers.",
    onboardingState: "ENRICHMENT",
    submittedAt: "2026-10-02T15:40:00Z",
  },
];

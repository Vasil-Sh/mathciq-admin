// ── Shared types for MathIQ Admin ──

export interface AdminUser {
  id: number;
  username: string;
  role: string;
  isOwner?: boolean;
  plan?: string;
  trialEndDate?: string;
  ageConfirmed?: boolean;
  birthDate?: string;
  telegram: string;
  priceMonth: string;
  startDate: string;
  endDate: string;
  createdAt?: string;
}

export interface UserData {
  createdAt?: string;
  id?: number;
  telegram: string;
  username: string;
  priceMonth: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isAdmin: boolean;
  isOwner?: boolean;
  daysUntilExpiry?: number;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  isAdmin?: boolean;
  isOwner?: boolean;
  telegram?: string;
  /** Signed in with a regular app account — the admin panel is not for it. */
  notAdmin?: boolean;
  /** Wrong credentials: attempts left before the 5-minute lock. */
  attemptsLeft?: number;
  /** Locked after too many attempts: seconds until the next try. */
  retryAfter?: number;
}

export type StatusFilter = "all" | "active" | "expired";
export type SortDirection = "asc" | "desc" | null;

// ── Betting monitoring (admin) ──

export interface AdminUserOverview {
  id: number;
  username: string;
  role: string;
  telegram: string;
  priceMonth: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  betCount: number;
  wins: number;
  losses: number;
  pending: number;
  totalStaked: number;
  totalProfit: number;
  winRate: number;
  roi: number;
  initialBank: number;
  manualAdjustments: number;
  currentBank: number;
  lossStreak: number;
  plan: string;
  planLabel?: string;
  trialEndDate?: string;
  ageConfirmed?: boolean;
  lastBetDate: string;
  lastBetAt?: string;
  extensions: number;
  lastPaymentDate: string;
  games: GameBreakdown[];
  isOwner?: boolean;
  birthDate?: string;
  paidTotal?: number;
  paidCount?: number;
  lastPaymentAmount?: number;
  cancelledAt?: string;
  refundedAmount?: number;
  selfLimitedUntil?: string;
  aiToday?: number;
  proUntil?: string;
  proBasePlan?: string;
  subscriptionCancelledAt?: string;
  subscriptionCancelMode?: string;
}

export interface GameBreakdown {
  game: string;
  bets: number;
  wins: number;
  losses: number;
  pending: number;
  staked: number;
  profit: number;
  winRate: number;
  roi: number;
}

export interface AdminUserBet {
  id: string;
  match: string;
  team1: string;
  team2: string;
  betType: string;
  odds: number;
  amount: number;
  stake: number | null;
  date: string;
  result: string;
  profit: number;
  game: string;
  currency: string;
  strategy: string;
  createdAt: string;
}

// ── Banners (advertising on the matches schedule) ──

export interface Banner {
  screen?: string;
  startsOn?: string | null;
  endsOn?: string | null;
  id: string;
  active: boolean;
  slot: number;
  title: string;
  description: string;
  imageUrl: string;
  href: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string | null;
  changedAt?: string | null;
}

export interface BannerInput {
  screen?: string;
  startsOn?: string | null;
  endsOn?: string | null;
  active: boolean;
  slot?: number;
  title: string;
  description: string;
  imageUrl: string;
  href: string;
}

export interface BannerSlotState {
  slot: number;
  placeholderEnabled: boolean;
}

// ── App settings (admin-managed) ──

export interface AppSettings {
  defaultMonthlyPrice: number;
  subscriptionDays: number;
  bannerSpecText: string;
  aiUsdUah?: number;
  basicPrice?: number;
  proPrice?: number;
  trialEnabled?: boolean;
  trialDays?: number;
  trialPlan?: string;
  aiDailyLimit?: number;
  churnInactiveDays?: number;
  churnLossStreak?: number;
}

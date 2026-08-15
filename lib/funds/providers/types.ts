export type FundSearchResult = {
  code: string;
  name: string;
  market: string;
  type: string;
  currency: string;
  source: string;
  establishedDate: string | null;
};

export type FundProfileData = {
  fullName: string | null;
  company: string | null;
  custodian: string | null;
  issueDate: string | null;
  establishedDate: string | null;
  establishedShares: number | null;
  managementFeeRate: number | null;
  custodianFeeRate: number | null;
  salesServiceFeeRate: number | null;
  benchmarkDescription: string | null;
  trackingTarget: string | null;
  investmentObjective: string | null;
  investmentScope: string | null;
  investmentStrategy: string | null;
  dividendPolicy: string | null;
  riskReturnCharacteristics: string | null;
  subscribeStatus: string | null;
  redeemStatus: string | null;
};

export type FundNavPoint = {
  valuationDate: string;
  publishedAt: string | null;
  unitNav: number;
  accumulatedNav: number | null;
  dailyReturn: number | null;
  dividendAmount: number | null;
  splitFactor?: number | null;
};

export type FundDividendEventData = {
  recordDate: string | null;
  exDate: string;
  paymentDate: string | null;
  amount: number;
  description: string | null;
};

export type FundManagerData = {
  managerName: string;
  startDate: string | null;
  endDate: string | null;
  tenureReturn: number | null;
  asOfDate: string | null;
};

export type FundHoldingData = {
  kind: "stock" | "bond";
  rank: number;
  code: string | null;
  name: string;
  weight: number | null;
  quantity: number | null;
  marketValue: number | null;
};

export type FundPortfolioData = {
  reportDate: string;
  stockPercent: number | null;
  bondPercent: number | null;
  cashPercent: number | null;
  otherPercent: number | null;
  industries: Array<{ name: string; weight: number }>;
  holdings: FundHoldingData[];
};

export type FundNavCoverage = {
  expectedCount: number | null;
  fetchedCount: number;
  firstDate: string | null;
  lastDate: string | null;
  complete: boolean;
  method: "full_source" | "paginated_api";
  dividendEventsComplete?: boolean;
  performanceAdjustmentVersion?: number;
};

export type FundScalePoint = {
  reportDate: string;
  netAssets: number | null;
  shares: number | null;
  holderCount: number | null;
};

export type FundFlowPoint = {
  reportDate: string;
  subscriptions: number | null;
  redemptions: number | null;
  totalShares: number | null;
};

export type FundHolderPoint = {
  reportDate: string;
  institutionPercent: number | null;
  individualPercent: number | null;
  internalPercent: number | null;
};

export type EtfPcfComponentData = {
  instrumentCode: string;
  instrumentName: string;
  quantity: number | null;
  substitutionFlag: string;
  creationPremiumRate: number | null;
  redemptionDiscountRate: number | null;
  substitutionCashAmount: number | null;
  creationCashSubstitute: number | null;
  redemptionCashSubstitute: number | null;
  market: string | null;
};

export type EtfPcfData = {
  fundCode: string;
  tradingDay: string;
  previousTradingDay: string | null;
  creationRedemptionUnit: number | null;
  navPerCreationUnit: number | null;
  nav: number | null;
  cashComponent: number | null;
  estimatedCashComponent: number | null;
  maxCashRatio: number | null;
  creationRedemptionStatus: string | null;
  creationRedemptionMechanism: string | null;
  publishIopv: boolean | null;
  creationLimit: number | null;
  redemptionLimit: number | null;
  limits: Record<string, number | null>;
  components: EtfPcfComponentData[];
};

export type ProviderResult<T> = {
  data: T;
  sourceUrl: string;
  raw: unknown;
  coverage?: FundNavCoverage;
  dividendEvents?: FundDividendEventData[];
};

export type FundDataProvider = {
  source: string;
  search(query: string): Promise<FundSearchResult[]>;
  profile(code: string): Promise<ProviderResult<FundProfileData>>;
  nav(code: string, from?: string, to?: string): Promise<ProviderResult<FundNavPoint[]>>;
  managers(code: string): Promise<ProviderResult<FundManagerData[]>>;
  portfolio(code: string, options?: { fullHistory?: boolean }): Promise<ProviderResult<FundPortfolioData[]>>;
  scale(code: string): Promise<ProviderResult<FundScalePoint[]>>;
  flows(code: string): Promise<ProviderResult<FundFlowPoint[]>>;
  holders(code: string): Promise<ProviderResult<FundHolderPoint[]>>;
  officialValidation(code: string, market: string): Promise<ProviderResult<{ verified: boolean; exchange: string }>>;
};

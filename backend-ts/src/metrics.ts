import type { MetricsResult, ColumnMetrics } from "./types";

/**
 * Classify columns by keyword matching.
 */
function classifyColumns(numericCols: string[]) {
  const revenue = numericCols.filter((c) =>
    ["revenue", "mrr", "arr", "income", "sales", "gmv"].some((kw) =>
      c.includes(kw),
    ),
  );
  const cost = numericCols.filter((c) =>
    ["cost", "expense", "spend", "burn", "cac"].some((kw) => c.includes(kw)),
  );
  const user = numericCols.filter((c) =>
    ["user", "customer", "subscriber", "client", "account"].some((kw) =>
      c.includes(kw),
    ),
  );
  const retention = numericCols.filter((c) =>
    ["retention", "churn", "nrr", "ndr"].some((kw) => c.includes(kw)),
  );
  return { revenue, cost, user, retention };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(val: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, val));
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length);
}

export function computeGrowthMetrics(
  data: Record<string, unknown>[],
  numericCols: string[],
): MetricsResult {
  if (!data.length || !numericCols.length) {
    return {
      growth_score: 0,
      efficiency_score: 0,
      pmf_signal: 0,
      scalability_index: 0,
      capital_efficiency: 0,
      metrics_detail: {},
      trends: {},
    };
  }

  const metricsDetail: Record<string, ColumnMetrics> = {};
  const trends: Record<string, number[]> = {};

  // Per-column stats
  for (const col of numericCols) {
    const vals = data
      .map((r) => {
        const v = Number(r[col]);
        return isNaN(v) ? null : v;
      })
      .filter((v): v is number => v !== null);

    if (!vals.length) continue;

    const detail: ColumnMetrics = {
      mean: round2(mean(vals)),
      latest: round2(vals[vals.length - 1]),
      min: round2(Math.min(...vals)),
      max: round2(Math.max(...vals)),
      total: round2(vals.reduce((a, b) => a + b, 0)),
    };

    if (vals.length > 1) {
      const pctChanges: number[] = [];
      for (let i = 1; i < vals.length; i++) {
        if (vals[i - 1] !== 0) {
          pctChanges.push(
            ((vals[i] - vals[i - 1]) / Math.abs(vals[i - 1])) * 100,
          );
        }
      }
      detail.avg_growth_rate = pctChanges.length ? round2(mean(pctChanges)) : 0;
      detail.growth_rates = pctChanges.map(round2);
      trends[col] = vals.map(round2);
    }

    metricsDetail[col] = detail;
  }

  const {
    revenue,
    cost,
    user: userCols,
    retention,
  } = classifyColumns(numericCols);

  // Growth Score (0-100)
  const growthCols = revenue.length
    ? revenue
    : userCols.length
      ? userCols
      : numericCols.slice(0, 2);
  const growthRates = growthCols
    .filter((c) => metricsDetail[c]?.avg_growth_rate !== undefined)
    .map((c) => metricsDetail[c].avg_growth_rate!);
  const avgGrowth = growthRates.length ? mean(growthRates) : 0;
  const growthScore = clamp(50 + avgGrowth * 2);

  // Efficiency Score (0-100)
  let efficiencyScore = 65;
  if (revenue.length && cost.length) {
    const revTotal = revenue.reduce(
      (s, c) => s + (metricsDetail[c]?.total ?? 0),
      0,
    );
    const costTotal = cost.reduce(
      (s, c) => s + (metricsDetail[c]?.total ?? 0),
      0,
    );
    if (costTotal > 0) {
      efficiencyScore = clamp((revTotal / costTotal) * 25);
    }
  }

  // PMF Signal (0-100)
  let pmfSignal = 55;
  const churnCols = numericCols.filter((c) => c.includes("churn"));
  const pureRetention = retention.filter((c) => !c.includes("churn"));
  if (pureRetention.length) {
    const retVals = pureRetention
      .filter((c) => metricsDetail[c])
      .map((c) => metricsDetail[c].latest);
    if (retVals.length) pmfSignal = clamp(mean(retVals));
  } else if (churnCols.length) {
    const churnVals = churnCols
      .filter((c) => metricsDetail[c])
      .map((c) => metricsDetail[c].latest);
    if (churnVals.length) pmfSignal = clamp(100 - mean(churnVals) * 10);
  } else if (growthRates.length) {
    const consistency =
      growthRates.length > 1 ? 100 - Math.min(100, std(growthRates) * 2) : 60;
    pmfSignal = clamp((consistency + growthScore) / 2);
  }

  // Scalability Index (0-100)
  let scalabilityIndex = 60;
  if (revenue.length && cost.length) {
    const revGrowth = Math.max(
      ...revenue.map((c) => metricsDetail[c]?.avg_growth_rate ?? 0),
    );
    const costGrowth = Math.max(
      ...cost.map((c) => metricsDetail[c]?.avg_growth_rate ?? 0),
    );
    if (costGrowth !== 0) {
      scalabilityIndex = clamp(50 + (revGrowth - costGrowth));
    } else if (revGrowth > 0) {
      scalabilityIndex = clamp(50 + revGrowth);
    }
  }

  // Capital Efficiency (0-100)
  let capitalEfficiency = 55;
  if (revenue.length && cost.length) {
    const revLatest = revenue.reduce(
      (s, c) => s + (metricsDetail[c]?.latest ?? 0),
      0,
    );
    const costLatest = cost.reduce(
      (s, c) => s + (metricsDetail[c]?.latest ?? 0),
      0,
    );
    if (costLatest > 0) {
      capitalEfficiency = clamp((revLatest / costLatest) * 30);
    }
  }

  return {
    growth_score: round2(growthScore),
    efficiency_score: round2(efficiencyScore),
    pmf_signal: round2(pmfSignal),
    scalability_index: round2(scalabilityIndex),
    capital_efficiency: round2(capitalEfficiency),
    metrics_detail: metricsDetail,
    trends,
  };
}

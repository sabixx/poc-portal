// poc_status.js - Centralized POC status determination
// All status logic is centralized here to ensure consistency across the app

const DAY_MS = 1000 * 60 * 60 * 24;
const HOURS_PER_DAY = 8;

/**
 * Get the as-of date from appState or use current date
 */
export function getAsOfDate(appState) {
  const d = appState?.asOfDate ? new Date(appState.asOfDate) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Count working days between two dates (excludes weekends)
 */
export function workingDaysBetween(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  if (e < s) return 0;

  let days = 0;
  const d = new Date(s);
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) days++;
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/**
 * Compute stalled engagement status
 * Returns info about whether POC has stalled (no use case completion in 4+ workdays)
 */
export function computeStalledEngagement(p, pocUcs, asOfDate) {
  const asOf = asOfDate || new Date();
  
  // Check if POC has started
  const pocStartDate = parseDate(p.poc_start_date);
  if (!pocStartDate || pocStartDate > asOf) {
    return { isStalled: false, workdaysSinceActivity: 0 };
  }
  
  // Get use case stats
  const ucStats = computeUseCaseStats(pocUcs);
  const { allCompleted, latestCompletedAt, totalUc, completedUc } = ucStats;
  
  // If all use cases completed, not stalled
  if (allCompleted) {
    return { isStalled: false, workdaysSinceActivity: 0 };
  }
  
  // If no use cases at all, check days since POC start
  if (totalUc === 0) {
    return { isStalled: false, workdaysSinceActivity: 0 };
  }
  
  // Calculate workdays since last activity
  // Activity is either: latest use case completion OR poc start date if no completions yet
  const lastActivityDate = latestCompletedAt || pocStartDate;
  const workdaysSinceActivity = workingDaysBetween(lastActivityDate, asOf);
  
  // Stalled if 4+ working days without activity (but some use cases remain)
  const isStalled = workdaysSinceActivity >= 4 && completedUc < totalUc;
  
  return {
    isStalled,
    workdaysSinceActivity,
    lastActivityDate,
    hasAnyCompletions: completedUc > 0
  };
}

/**
 * Parse date safely
 */
export function parseDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Compute use case metrics for a POC
 */
export function computeUseCaseStats(pocUcs) {
  let totalUc = 0;
  let completedUc = 0;
  let latestCompletedAt = null;

  (pocUcs || []).forEach((puc) => {
    const uc = puc.expand && puc.expand.use_case;
    if (!uc) return;
    if (!puc.is_active && !puc.is_completed) return;

    totalUc++;
    if (puc.is_completed) {
      completedUc++;
      if (puc.completed_at) {
        const c = new Date(puc.completed_at);
        if (!Number.isNaN(c.getTime())) {
          if (!latestCompletedAt || c > latestCompletedAt) {
            latestCompletedAt = c;
          }
        }
      }
    }
  });

  return {
    totalUc,
    completedUc,
    allCompleted: totalUc > 0 && completedUc === totalUc,
    latestCompletedAt
  };
}

/**
 * Compute customer preparation readiness
 */
export function computePrepReadiness(p, pocUcs, asOfDate) {
  const pocStart = p.poc_start_date ? new Date(p.poc_start_date) : null;
  if (!pocStart || Number.isNaN(pocStart.getTime())) {
    return { label: "none", remaining: 0, capacity: 0, daysLeft: 0, outstandingCount: 0, isAtRisk: false };
  }

  const asOf = asOfDate || new Date();

  let remainingHours = 0;
  let hasPrep = false;
  let outstandingCount = 0;

  (pocUcs || []).forEach((puc) => {
    const uc = puc.expand && puc.expand.use_case;
    if (!uc || !uc.is_customer_prep) return;
    hasPrep = true;

    if (puc.is_completed) return;

    outstandingCount++;

    const est =
      typeof uc.estimate_hours === "number"
        ? uc.estimate_hours
        : typeof puc.estimate_hours === "number"
        ? puc.estimate_hours
        : 0;

    remainingHours += est;
  });

  if (!hasPrep) {
    return { label: "none", remaining: 0, capacity: 0, daysLeft: 0, outstandingCount: 0, isAtRisk: false };
  }

  const daysLeft = workingDaysBetween(asOf, pocStart);
  const capacity = Math.max(0, daysLeft * HOURS_PER_DAY);

  if (remainingHours <= 0) {
    return { label: "ready", remaining: 0, capacity, daysLeft, outstandingCount, isAtRisk: false };
  }

  if (daysLeft <= 0 || capacity <= 0) {
    return { label: "overdue", remaining: remainingHours, capacity, daysLeft, outstandingCount, isAtRisk: true };
  }

  const isAtRisk = remainingHours > capacity;
  const label = isAtRisk ? "at risk" : "in time";
  return { label, remaining: remainingHours, capacity, daysLeft, outstandingCount, isAtRisk };
}

/**
 * Main POC status determination - CENTRAL FUNCTION
 * Returns detailed status info for a POC
 */
export function computePocStatus(p, pocUcs, asOfDate) {
  const asOf = asOfDate || new Date();

  // 0. Check if POC is deregistered - should be hidden everywhere
  const isDeregistered = !!p.deregistered_at;

  // 1. Check last update age
  const lastStr = p.last_daily_update_at;
  const last = lastStr ? new Date(lastStr) : null;
  let diffDays = Infinity;

  if (last && !Number.isNaN(last.getTime())) {
    diffDays = (asOf - last) / DAY_MS;
  }
  if (diffDays < 0) diffDays = 0;

  // 2. Use case completion stats
  const ucStats = computeUseCaseStats(pocUcs);
  const { totalUc, completedUc, allCompleted, latestCompletedAt } = ucStats;

  // 3. Prep readiness
  const prepInfo = computePrepReadiness(p, pocUcs, asOf);

  // 4. Stalled engagement check
  const stalledInfo = computeStalledEngagement(p, pocUcs, asOf);

  // 5. POC end date and timing
  const pocEndDate = parseDate(p.poc_end_date_plan || p.poc_end_date);
  let daysUntilEnd = null;
  let isOverdue = false;
  let endDatePassed = false;

  if (pocEndDate) {
    const timeDiff = pocEndDate - asOf;
    daysUntilEnd = Math.ceil(timeDiff / DAY_MS);
    isOverdue = asOf > pocEndDate;
    endDatePassed = asOf > pocEndDate;
  }

  // 6. Commercial result
  const commercialResult = p.commercial_result || "unknown";
  const hasCommercialResult = commercialResult && commercialResult !== "unknown";

  // 7. Determine overall status
  // For POCs with NO use cases (manual POCs): use end_date logic instead of heartbeat
  // For POCs WITH use cases: use heartbeat logic (last_updated_at)
  let isActive, isInReview, isCompleted;

  if (isDeregistered) {
    // Deregistered POCs are hidden - mark as not active/in-review/completed
    isActive = false;
    isInReview = false;
    isCompleted = false;
  } else if (totalUc === 0) {
    // Manual POC (no use cases): stay Active until end_date, then In Review
    isActive = !endDatePassed;
    isInReview = endDatePassed && !hasCommercialResult;
    isCompleted = hasCommercialResult;
  } else {
    // Regular POC with use cases: use heartbeat logic
    isActive = !allCompleted && diffDays <= 2;
    isInReview = (allCompleted || diffDays > 2) && !hasCommercialResult;
    isCompleted = hasCommercialResult && (allCompleted || diffDays > 2);
  }

  // 8. Determine risk status
  let status = "on_track";
  let statusLabel = "On Track";

  if (isCompleted) {
    status = "completed";
    statusLabel = "Completed";
  } else if (isInReview) {
    status = "in_review";
    statusLabel = "In Review";
  } else if (isOverdue) {
    status = "overdue";
    statusLabel = "Overdue";
  } else if (prepInfo.isAtRisk) {
    status = "at_risk_prep";
    statusLabel = "At Risk (Customer Preparation)";
  } else if (stalledInfo.isStalled) {
    status = "at_risk_stalled";
    statusLabel = "At Risk (Stalled)";
  } else if (daysUntilEnd !== null && daysUntilEnd <= 3 && daysUntilEnd >= 0 && completedUc < totalUc) {
    status = "at_risk";
    statusLabel = "At Risk";
  }

  return {
    // Core status
    status,
    statusLabel,
    isActive,
    isInReview,
    isCompleted,
    isOverdue,
    isDeregistered,

    // Risk indicators
    isAtRisk: status === "at_risk" || status === "at_risk_prep" || status === "at_risk_stalled",
    isAtRiskPrep: status === "at_risk_prep",
    isAtRiskStalled: status === "at_risk_stalled",
    isOnTrack: status === "on_track",
    
    // Use case stats
    totalUc,
    completedUc,
    allCompleted,
    completionPct: totalUc > 0 ? Math.round((completedUc / totalUc) * 100) : 0,
    
    // Timing
    daysUntilEnd,
    diffDays,
    latestCompletedAt,
    
    // Prep
    prepInfo,
    
    // Stalled engagement
    stalledInfo,
    
    // Results
    commercialResult,
    technicalResult: p.technical_result || "unknown"
  };
}

/**
 * Categorize POC for dashboard display
 */
export function categorizePoc(p, pocUcs, asOfDate) {
  const status = computePocStatus(p, pocUcs, asOfDate);

  return {
    poc: p,
    status,
    category: status.status,
    isActive: status.isActive,
    isInReview: status.isInReview,
    isCompleted: status.isCompleted,
    isOverdue: status.isOverdue,
    isDeregistered: status.isDeregistered,
    isAtRisk: status.isAtRisk,
    isAtRiskPrep: status.isAtRiskPrep,
    isAtRiskStalled: status.isAtRiskStalled,
    isOnTrack: status.isOnTrack
  };
}

/**
 * Get POC completion month info for time-based filtering
 */
export function getPocCompletionMonth(p, asOfDate) {
  const asOf = asOfDate || new Date();
  const pocEndDate = parseDate(p.poc_end_date_plan || p.poc_end_date);
  
  if (!pocEndDate) return { thisMonth: false, nextMonth: false, lastMonth: false };
  
  const now = asOf;
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    thisMonth: pocEndDate >= thisMonthStart && pocEndDate < nextMonthStart,
    nextMonth: pocEndDate >= nextMonthStart && pocEndDate <= nextMonthEnd,
    lastMonth: pocEndDate >= lastMonthStart && pocEndDate <= lastMonthEnd
  };
}

/**
 * Dashboard metrics calculator
 */
export function computeDashboardMetrics(pocs, pocUseCasesMap, asOfDate) {
  const asOf = asOfDate || new Date();
  
  const metrics = {
    onTrack: [],
    atRisk: [],
    atRiskPrep: [],
    atRiskStalled: [],
    overdue: [],
    inReview: [],
    completingThisMonth: [],
    completingNextMonth: [],
    completedLastMonth: []
  };

  pocs.forEach(p => {
    const pocUcs = pocUseCasesMap.get(p.id) || [];
    const categorized = categorizePoc(p, pocUcs, asOf);

    // Skip deregistered POCs - they should not appear anywhere
    if (categorized.isDeregistered) return;

    const monthInfo = getPocCompletionMonth(p, asOf);

    // Status categories
    if (categorized.isOnTrack && categorized.isActive) {
      metrics.onTrack.push(p);
    }
    if (categorized.isAtRisk && !categorized.isAtRiskPrep && !categorized.isAtRiskStalled && categorized.isActive) {
      metrics.atRisk.push(p);
    }
    if (categorized.isAtRiskPrep && categorized.isActive) {
      metrics.atRiskPrep.push(p);
    }
    if (categorized.isAtRiskStalled && categorized.isActive) {
      metrics.atRiskStalled.push(p);
    }
    if (categorized.isOverdue && categorized.isActive) {
      metrics.overdue.push(p);
    }
    if (categorized.isInReview) {
      metrics.inReview.push(p);
    }
    
    // Time-based categories (for active/in-review POCs)
    if (categorized.isActive || categorized.isInReview) {
      if (monthInfo.thisMonth) {
        metrics.completingThisMonth.push(p);
      }
      if (monthInfo.nextMonth) {
        metrics.completingNextMonth.push(p);
      }
    }
    
    // Completed last month
    if (categorized.isCompleted && monthInfo.lastMonth) {
      metrics.completedLastMonth.push(p);
    }
  });

  return metrics;
}
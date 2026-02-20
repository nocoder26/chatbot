# Re-identification Risk Assessment — Izana AI

## Methodology

This report assesses the risk of re-identifying individuals from Tier 2 anonymized data using the following framework:

### 1. K-Anonymity (k≥10)

**Implementation**: Before any record is committed to Tier 2, the system validates that at least 10 records share the same quasi-identifier combination.

**Quasi-identifiers used**:
- Language (9 possible values)
- Question category (9 possible values)
- Age group (5-year brackets)

**Behavior when k<10**: Records are suppressed (excluded from Tier 2) and queued for re-evaluation in the next extraction cycle. As data volume grows, previously suppressed records may meet the threshold.

### 2. Differential Privacy (ε=1.0)

**Implementation**: Laplace mechanism applied to all numeric bloodwork values before storage in Tier 2.

**Parameters**:
- Epsilon (ε) = 1.0 (configurable via `DP_EPSILON` env var)
- Sensitivity = 1.0 (per-value)
- Mechanism: `noise = -scale * sign(u) * ln(1 - 2|u|)` where `scale = sensitivity/ε`

**Trade-off**: At ε=1.0, the noise provides moderate privacy protection while maintaining clinical utility for aggregate analysis. Individual values are not precisely recoverable.

### 3. PII Stripping

**Patterns detected and removed**:
- Email addresses
- Phone numbers (7+ digits)
- Doctor/Professor names ("Dr. Smith", "Prof. García")
- Clinic/Hospital names
- Partner/spouse name references
- Street addresses
- Social Security Numbers

**Limitation**: Regex-based detection is not 100% accurate. Unusual PII formats may evade detection. Quarterly manual review recommended.

### 4. Value Generalization

**Bloodwork values**: Mapped to clinical range categories (low/normal/elevated) using standard reference ranges for 12+ common markers.

**Age**: Bucketed to 5-year brackets (e.g., 38 → "35-40").

**Dates**: Replaced with month-level temporal buckets or cycle phase labels.

### 5. Rare Combination Suppression

Records with unique medication/condition combinations appearing fewer than 5 times are excluded from Tier 2.

## Risk Assessment Summary

| Attack Vector | Risk Level | Mitigation |
|--------------|------------|------------|
| Linkage attack (combining quasi-identifiers) | Low | k-anonymity k≥10 |
| Numeric reconstruction | Low | Differential privacy ε=1.0 |
| Free-text PII recovery | Medium | Regex PII stripping + manual review |
| Membership inference | Low | DP noise + generalization |
| Attribute inference | Low | Value ranges, not exact values |

## Monitoring

- k-anonymity metrics logged per extraction cycle
- Suppression counts tracked (high suppression = insufficient volume)
- Quarterly risk review to be scheduled

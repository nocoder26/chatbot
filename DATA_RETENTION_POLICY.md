# Data Retention Policy — Izana AI

## Overview

Izana AI operates a three-tier data architecture with different retention periods justified by purpose limitation and data minimization principles.

## Tier 1: Operational Data (24 hours)

| Data Type | Retention | Justification |
|-----------|-----------|---------------|
| User accounts | 24 hours | Minimum for session functionality |
| Chat messages | 24 hours | Required for conversation context |
| Bloodwork reports | 24 hours | Required for analysis delivery |
| User activity logs | 24 hours | Required for feedback collection |
| Consent records | 24 hours (with user) | Stored alongside user record |
| Authentication credentials | 24 hours | Required for session security |

**Deletion method**: Automated cron job runs hourly at :15, deletes all records older than 24 hours. Cascade deletion respects foreign key constraints.

## Tier 2: Training Data (18 months)

| Data Type | Retention | Justification |
|-----------|-----------|---------------|
| Anonymized Q&A pairs | 18 months | Model improvement requires sufficient data volume |
| Generalized bloodwork | 18 months | Pattern analysis needs longitudinal data |
| Training feedback | 18 months | Quality scoring for model evaluation |

**Deletion method**: `expiresAt` field checked during hourly cron. Records past expiry are deleted automatically. Quarterly re-identification risk review conducted.

**Anonymization techniques applied**:
- PII removal (names, emails, clinics, addresses)
- Bloodwork value generalization to clinical ranges
- Age bucketed to 5-year brackets
- Differential privacy noise (ε=1.0, Laplace mechanism)
- k-anonymity validation (k≥10)
- Rare combination suppression (threshold=5)

## Tier 3: Aggregated Analytics (Indefinite)

| Data Type | Retention | Justification |
|-----------|-----------|---------------|
| Population-level statistics | Indefinite | No individual data, GDPR-exempt aggregates |

**Conditions**: Minimum cell size n≥10 for all metrics. No individual records stored. Metrics computed weekly from Tier 2.

## User-Initiated Deletion

Users may request deletion at any time via the profile page. Upon request:
1. All Tier 1 data deleted immediately
2. Processing restriction created to prevent future Tier 2 extraction
3. Tier 3 aggregates are not reversible and remain unchanged
4. Deletion request logged in audit trail

## Review Schedule

- **Quarterly**: Re-identification risk assessment on Tier 2 data
- **Annually**: Full retention policy review
- **On consent version change**: Re-evaluate all active consents

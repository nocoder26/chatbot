# GDPR Operations Guide — Izana AI

## Architecture

```
Tier 1 (PostgreSQL, 24h)  →  Tier 2 (PostgreSQL + Pinecone, 18mo)  →  Tier 3 (PostgreSQL, indefinite)
       ↑                              ↑                                        ↑
   Encrypted                     Anonymized                              Aggregated only
```

## Cron Schedules

| Job | Schedule | File |
|-----|----------|------|
| Tier 2 Extraction | Every hour at :00 | `backend-node/src/cron/tier2Extraction.js` |
| Tier 1 Deletion + Tier 2 Expiry | Every hour at :15 | `backend-node/src/cron/privacyDeletion.js` |
| Tier 3 Aggregation | Weekly, Sunday 00:00 | `backend-node/src/cron/tier3Aggregation.js` |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ENCRYPTION_MASTER_KEY` | 64-char hex string for AES-256-GCM | Yes (for encryption) |
| `CONSENT_VERSION` | Current consent version (e.g., "1.0") | No (default: "1.0") |
| `DP_EPSILON` | Differential privacy epsilon | No (default: 1.0) |
| `K_ANONYMITY_THRESHOLD` | Minimum k-anonymity value | No (default: 10) |
| `TIER2_RETENTION_MONTHS` | Tier 2 data retention | No (default: 18) |

### Generating an Encryption Key

```bash
openssl rand -hex 32
```

## Running the Migration Pipeline Manually

```javascript
import { runTier2Extraction } from './src/cron/tier2Extraction.js';
import { runTier3Aggregation } from './src/cron/tier3Aggregation.js';

await runTier2Extraction();  // Extract + anonymize Tier 1 → Tier 2
await runTier3Aggregation(); // Aggregate Tier 2 → Tier 3
```

## Verifying Anonymization

```javascript
import { verifyAuditChain } from './src/gdpr/auditLogger.js';
const result = await verifyAuditChain();
console.log(result); // { valid: true, totalChecked: N }
```

## Handling User Rights Requests

### Data Export (Article 15)
User clicks "Download My Data" on profile page → `GET /api/gdpr/export` → JSON file download.

### Data Deletion (Article 17)
User clicks "Delete All My Data" on profile page → `POST /api/gdpr/delete` → Cascade deletion + processing restriction.

### Processing Restriction (Article 18)
`POST /api/gdpr/restrict` → Creates `ProcessingRestriction` record → Tier 2 extraction skips this user.

### Object to Training (Article 21)
`POST /api/gdpr/object-training` → Sets `restrictTier2 = true` + withdraws model training consent.

## Audit Log

All sensitive operations are logged to the `AuditLog` table with SHA-256 hash chain integrity.

### Verifying Chain Integrity

```javascript
import { verifyAuditChain } from './src/gdpr/auditLogger.js';
const { valid, brokenAt, totalChecked } = await verifyAuditChain();
```

### Logged Actions
- `consent_granted`, `consent_withdrawn`
- `export_requested`, `deletion_completed`
- `admin_access`
- `tier2_extraction`, `tier3_aggregation`
- `rectification_applied`, `processing_restricted`

## Database Schema

New GDPR-related tables:
- `Consent` — User consent records with versioning
- `DeletionRequest` — Tracks deletion request lifecycle
- `ProcessingRestriction` — Per-user Tier 2 extraction blocks
- `AnonymizedQAPair` — Tier 2 anonymized Q&A training data
- `AnonymizedBloodwork` — Tier 2 generalized bloodwork data
- `TrainingFeedback` — Tier 2 quality feedback
- `AnalyticsAggregate` — Tier 3 population-level metrics
- `AuditLog` — Tamper-proof operation log

## File Structure

```
backend-node/src/
├── gdpr/
│   ├── encryption.js        — AES-256-GCM envelope encryption
│   ├── anonymization.js     — Generalization, DP noise, PII removal
│   ├── riskAssessment.js    — K-anonymity calculator
│   ├── sanitizer.js         — Input PII detection and stripping
│   ├── consentCheck.js      — Consent enforcement middleware
│   ├── auditLogger.js       — Hash-chain audit logging
│   └── modelImprovement.js  — Training data export and gap analysis
├── routes/
│   ├── consent.js           — Consent grant/check/withdraw API
│   └── userRights.js        — GDPR Articles 15-22 endpoints
└── cron/
    ├── tier2Extraction.js   — Hourly anonymization pipeline
    ├── tier3Aggregation.js  — Weekly aggregation
    └── privacyDeletion.js   — Tier 1 deletion + Tier 2 expiry
```

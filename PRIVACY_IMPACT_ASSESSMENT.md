# Privacy Impact Assessment (PIA) — Izana AI

## 1. Project Overview

Izana AI is an anonymous fertility health chatbot that processes special category health data (GDPR Article 9) including conversation data and bloodwork analysis results. Based in Spain (EU jurisdiction).

## 2. Data Flows

```
User Input → [TLS 1.3] → Express API → AES-256-GCM Encryption → PostgreSQL (Tier 1)
                                                                        ↓ (hourly)
                                                              Anonymization Pipeline
                                                                        ↓
                                                         PostgreSQL (Tier 2) + Pinecone
                                                                        ↓ (weekly)
                                                              Aggregation Engine
                                                                        ↓
                                                         PostgreSQL (Tier 3 — Aggregated)
```

### Tier 1 (Operational): 24-hour retention
- Pseudonymised with random UUID
- AES-256-GCM encrypted at rest (envelope encryption)
- Contains: conversations, bloodwork data, user feedback

### Tier 2 (Training): 18-month retention
- Strongly anonymised via: generalization, differential privacy (ε=1.0), PII stripping, k-anonymity (k≥10)
- Contains: sanitized Q&A pairs, generalized bloodwork ranges, feedback scores

### Tier 3 (Analytics): Indefinite retention
- Fully anonymised population-level aggregates only
- Minimum cell size n≥10 for all metrics

## 3. Legal Basis

- **Article 6(1)(a)**: Explicit consent obtained before any data collection
- **Article 9(2)(a)**: Explicit consent for health data processing
- **Article 9(2)(j)**: Scientific research purposes (model improvement)
- Consent is versioned, timestamped, and withdrawable

## 4. Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Re-identification from Tier 2 | Low | High | k-anonymity (k≥10), differential privacy, PII stripping |
| Data breach of Tier 1 | Low | High | AES-256-GCM encryption, 24h auto-deletion |
| Unauthorized access | Low | Medium | JWT auth, admin PIN, rate limiting, audit logs |
| Consent not properly recorded | Low | High | Consent middleware blocks all data routes |
| Audit log tampering | Very Low | Medium | SHA-256 hash chain integrity verification |

## 5. Data Subject Rights

All rights are implemented via `/api/gdpr/*` endpoints:
- Right to Access (Art. 15): Full data export
- Right to Erasure (Art. 17): Cascade deletion within 24 hours
- Right to Rectification (Art. 16): Bloodwork value correction
- Right to Restrict Processing (Art. 18): Pause Tier 2 extraction
- Right to Object (Art. 21): Opt-out of model training

## 6. DPO Contact

To be appointed. Contact: [admin email to be configured]

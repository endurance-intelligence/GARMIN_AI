# Private ORC source import (phase 2)

The owner uploads the original ZIP in Calendar > Trainingsbibliothek > ORC-Originalbibliothek. The local reader verifies all manifest entries and original SHA-256 values before sending individual records over the already authenticated archive endpoint. Each independent source keeps its UUID, raw manifest entry, full original image and review flag. Re-import is idempotent for exact source data; conflicting UUIDs are rejected. No data or images are included in GitHub or Pages.

The private source table is deliberately separate from the reviewed workout archive. It is not read by the planner or Coach. Opening a source is read-only; explicitly copying into the reviewed editor creates a separately approved workout. No automatic planning, no remote workout writes, no paid image processing. Athlete-specific prescriptions and reviewed cross-instance synchronization remain separate. Never treat a false review flag as a user's training approval.

The ZIP can be imported independently under either instance's authenticated owner session. An administrator may copy only the immutable source rows between the two isolated projects, never athlete data. Compare IDs, hashes and image bytes after copying.

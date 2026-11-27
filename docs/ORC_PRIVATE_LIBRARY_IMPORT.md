# ORC private library import — phase 1

The supplied package contains 27 separate poster records. Never deduplicate by title, similarity, group or training type. Preserve source image SHA-256, exact image bytes, original group steps, source notes, independent pace rules and review flags. Unknown values remain null; ranges/uncertain prescriptions need review before approval.

The GitHub repository is public. The actual poster images and athlete names must not be committed or bundled in Pages. Both primary and secondary deployments currently use different Supabase projects. Provision the same reviewed template library privately in both projects; never share health data, calendar snapshots or credentials between owners. A later authenticated import must store the images privately, verify hashes, persist source notes and rule metadata, and make the source image accessible to the authorized owner only. A review flag is not permission to export or plan.

Individual mode should use athlete-specific evidence for the required anchor (threshold, VO2max pace, or manually entered work pace), with a separate workload limit and explicit approval. A threshold HR value is not a threshold pace. If evidence is missing or the session is unsuitable, do not manufacture exact targets. Preserve unknown recovery pace and separate hill-effort targets, and do not mutate original groups. Calendar drafts must freeze the selected individual prescription; do not alter existing archived drafts.

This PR adds only the manifest and image integrity validation contract and synthetic tests. It intentionally does not enable production import, image storage, planning or automatic athlete prescriptions. No real poster assets or personal data are included.

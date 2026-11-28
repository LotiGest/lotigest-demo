-- Apply only to an isolated fictitious QA database, after its identity marker exists.
CREATE TABLE IF NOT EXISTS nexora_qa_entitlement (
 installation_id TEXT PRIMARY KEY REFERENCES nexora_installation_identity(installation_id),
 contract_id TEXT NOT NULL UNIQUE,
 license_version INTEGER NOT NULL CHECK(license_version>0),
 contract_version INTEGER NOT NULL CHECK(contract_version>0),
 plan_code TEXT NOT NULL CHECK(plan_code IN ('promocion','profesional','empresarial','corporativo')),
 state TEXT NOT NULL CHECK(state IN ('issued','suspended')),
 starts_on TEXT NOT NULL,
 expires_on TEXT NOT NULL,
 grace_until TEXT NOT NULL,
 CHECK(contract_id='LOTIGEST__'||installation_id),
 CHECK(starts_on<=expires_on AND expires_on<=grace_until)
) STRICT;

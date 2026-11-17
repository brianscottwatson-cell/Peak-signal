# Opportunity schema → form field mapping (wire-ready)

**Source of truth for DOM names:** `17-opportunity-field-inventory.md` (sandbox walkthrough 2026-09-19, `loc8.dev.cablefinder.net/opportunity`, ~61 fields).
**Schema:** `opportunity.schema.json` v1.0.0. Fill automation (deal-builder / MCP / UI) maps schema keys → DOM control names below. `metadata.*` is file-layer only — never submitted to the form.

## Partner Information

| Schema key | DOM control | Type | Required | Notes |
|---|---|---|---|---|
| `partner.fullName` | `partnerFullName` | text | Yes | Prefilled in sandbox |
| `partner.email` | `partnerEmail` | email | Yes | Browser email validation |
| `partner.phone` | `partnerPhone` | tel | Yes | Pattern `([0-9]-)?[0-9]{3}-[0-9]{3}-[0-9]{4}` |

## Customer Information

| Schema key | DOM control | Type | Required | Notes |
|---|---|---|---|---|
| `customer.businessName` | `custBusinessName` | text | Yes | |
| `customer.contactFirstName` | `custContactFirstName` | text | Yes | |
| `customer.contactLastName` | `custContactLastName` | text | Yes | |
| `customer.contactEmail` | `custContactEmail` | email | Yes | Browser email validation |
| `customer.contactPhone` | `custContactPhone` | tel | Yes | Pattern `([0-9])?[0-9]{3}[0-9]{3}[0-9]{4}` |
| `customer.locationCount` | `numberOfLocationServices` | number | No | Count only — no repeating address editor renders |
| `customer.address.line1` | `serviceAddress` | text | Yes | Primary street address |
| `customer.address.line2` | `serviceAddress2` | text | No | Unit/suite |
| `customer.address.line2NotNeeded` | `serviceAddress2NotNeeded` | checkbox | Yes when line2 blank | Awkward UI: required *alternative* to line2 |
| `customer.address.city` | `serviceAddressCity` | text | Yes | |
| `customer.address.state` | `serviceAddressState` | text | Yes | e.g. FL, CO |
| `customer.address.zip` | `serviceAddressZip` | text | Yes | US ZIP, five digits |
| `customer.address.country` | `serviceAddressCountry` | select | No (DOM) | United States / Canada |

## Service(s) Needed

| Schema key | DOM control | Type | Required | Notes |
|---|---|---|---|---|
| `services.selected[]` | `networkNeeded` / `sdWanNeeded` / `phoneVoiceNeeded` / `tvNeeded` | checkbox ×4 | ≥1 in practice | Individual boxes not marked required, but flow needs ≥1 to unlock sub-steps |
| `services.term.mtm` | `mtmTerm` | checkbox | ≥1 term in practice | |
| `services.term.y1` | `1yTerm` | checkbox | ≥1 term in practice | |
| `services.term.y2` | `2yTerm` | checkbox | ≥1 term in practice | Used in sandbox tests |
| `services.term.y3` | `3yTerm` | checkbox | ≥1 term in practice | |
| `services.desiredPricePoint` | `desiredPricePoint` | number | Yes | min 0, default 0. **null → leave default; numeric string → fill. Never invent.** |
| `services.dateServicesNeeded` | `dateServicesNeeded` | date | Yes | e.g. 2026-10-19 |
| `services.roeDisclaimerConfirmed` | `servicesDisclaimerConfirmation` | checkbox | Yes, must be true | ROE: account may be registered/locked by another channel, may be non-commissionable |

## Network Connectivity sub-step (only when `network` selected)

| Schema key | DOM control | Type | Required | Notes |
|---|---|---|---|---|
| `networkConnectivity.connectivityType` | `connectivityType` | select | Yes | Broadband / T-1 / Coax / EOC / Satellite / Fiber / Fixed / Wireless / I don't know |
| `networkConnectivity.bandwidthMbps` | `bandwidthSpeed` | number | Yes | min 0; Mbps-style, e.g. 1000 |
| `networkConnectivity.existingProvider` | `existingService` | select | No | Altice / AT&T / Bigleaf / Broadsky / Cato Networks / Comcast / Frontier / Lumen / Mediacom / Spectrotel / Spectrum / VeloCloud / Verizon / Viasat / Zayo / Other / Cox |
| `networkConnectivity.preferredVendors[]` | `internetVendor*` | checkbox ×19 | No | DontKnow / AllStream / Altice / ATT / Bigleaf / Broadsky / CatoNetworks / Comcast / Cox / Frontier / Lumen / **Medicom** (UI spelling, one m) / SpectroTel / Spectrum / VeloCloud / Verizon / Viasat / Zayo / Other |

## Voice sub-step (only when `voice` selected)

| Schema key | DOM control | Type | Required | Notes |
|---|---|---|---|---|
| `voice.voiceType` | `voiceType` | select | Yes | Direct Routing / CCaaS / Collaboration/Meeting / POTS / UCaaS / SIP / I don't know |
| `voice.seats` | `numSeats` | number | Yes | min 0; "Seats/Licenses/Lines"; 100 accepted in sandbox |
| `voice.currentProvider` | `currentVoiceProvider` | select | No | Dont know / 8x8 / Nextiva / RingCentral / Zoom / Altice / AT&T / Comcast / Cox / Frontier / Lumen / Medicom / Spectrum / Verizon / Other |
| `voice.preferredVendors[]` | `voiceVendor*` | checkbox ×6 | No | DontKnow / 8x8 / Nextiva / RingCentral / Zoom / **VoiceVendorOther** (capital V in DOM) |
| `voice.employees` | `numEmployees` | number | Yes | min 0 |
| `voice.website` | `customerWebsite` | text | Yes | URL-like free text |

## Notes

| Schema key | DOM control | Type | Required | Notes |
|---|---|---|---|---|
| `notes.opportunityNotes` | `confirmationNotes` | textarea | No | **No review page after this** — Notes is the last screen before SUBMIT. Extra site addresses + SANDBOX marker go here. |

---

## Validate-draft checklist

Run before any fill or submit. All must pass.

1. JSON validates against `opportunity.schema.json` (check `schemaVersion`).
2. `network` in `services.selected` → `networkConnectivity` present. `voice` in `selected` → `voice` present.
3. `desiredPricePoint` is `null` or a customer-stated number — **never invented**.
4. `locationCount` ≥ 1; sites 2..N written as free text in `notes.opportunityNotes`.
5. `address.line2` blank → `address.line2NotNeeded` is `true`.
6. ≥1 service selected and ≥1 term true.
7. `roeDisclaimerConfirmed` is `true` and the partner has read what ROE means.
8. No secrets, tokens, or credentials anywhere in the file. No Peak/personal content.
9. `metadata.source`, `metadata.status`, `metadata.createdAt`, `metadata.updatedAt` set; status is honest (`draft` / `dry-run` / `submitted-sandbox`).
10. Sandbox only. Never fill the production form without Brian's explicit approval.
11. Drafts stay ID-less: no `externalOpportunityId` until Cable Finder confirms a lookup path.

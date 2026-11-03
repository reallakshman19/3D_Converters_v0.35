# XML Compare Core Contract

The XML Compare feature is a source-target InputXML compare and port workflow. Its authority is data-first, not UI-first.

## Core intent

1. Build stable source and target element records from InputXML/UXML evidence.
2. Create an authoritative MatchMap before any visual linking or porting.
3. Use the MatchMap for node remap, orientation handling, and later cosine/frame correction.
4. Treat canvas links as review visualization only; they must never be the source of porting truth.
5. Keep porting transactional: preview first, apply second, export third.

## Architecture rules

- First-class modules must be named `XmlCompare*.js`.
- Each first-class module must stay below 300 lines.
- Modules must export an `XML_COMPARE_*_SCHEMA` contract marker.
- No shim, wrapper, monkey patch, prototype patch, global runtime mutation, or MutationObserver patch layer.
- No direct console logging from XML Compare modules; diagnostics must flow through `XmlCompareLogScreen`.
- UI bridges may call explicit viewer APIs only.
- Existing compare behavior must remain separate from porting authority.

## Required log path

All debug and user-visible diagnostics should use `XmlCompareLogScreen` entries. The log screen is the inspectable surface for alignment, matching, manual linking, preview, apply, export, and validation events.

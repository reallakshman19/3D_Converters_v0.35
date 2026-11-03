# Loss Contract

Each object export path should declare:

```json
{
  "objectId": "SUP-1",
  "sourceFormat": "XML",
  "targetFormat": "PCF",
  "fidelityClass": "RECONSTRUCTED",
  "rawPreserved": false,
  "normalizedPreserved": true,
  "reconstructedFields": ["SUPPORT_NAME", "SUPPORT_DIRECTION"],
  "droppedFields": [],
  "warnings": ["CA code reconstructed from axis restraint semantics."]
}
```

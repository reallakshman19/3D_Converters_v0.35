# Loss Contract

The app is honest about what survives and what does not survive an export cycle. Each export adapter generates a loss summary during the export process and includes it in the result envelope.

## Standard Envelopes

Every export output returns a structured result envelope:
```js
{
  ok: true,
  text: '...',
  blob: null,
  losses: [...],
  warnings: [...],
  meta: {
    producedAt: '...',
    producer: '...',
    targetFormat: '...'
  }
}
```

## Supported Exports
- **XML**: Highly degraded, many analytical items dropped.
- **GLB**: Loses analytical structural node information and metadata, preserves geometry.
- **PCF**: May downgrade fully annotated geometry.
- **PCFX**: Considered near-lossless canonical.

# XML Builder audit addendum — rigid evidence

Baseline reviewed: `fc43c4df40793f7437aca7ab06dcf50b5edacb99`

## F12 — `Rigid=0` is treated as positive rigid evidence

The custom-input model defaults every node to `rigid: "0"`, and the generated node XML emits `<Rigid>0</Rigid>`. The shared InputXML core currently classifies any non-empty `Rigid` text as rigid evidence:

```text
text(row.rigid) !== ""
```

Therefore the default zero value can generate an unintended `<RIGID>` child for ordinary pipe nodes.

**Approved correction:** a node has explicit rigid evidence only when:

- `ComponentType` is `RIGID`; or
- numeric `Rigid` is greater than zero; or
- existing positive-weight `FBLI` evidence applies.

The existing rigid weight scale remains unchanged and separately diagnosed. Regression coverage must prove that `Rigid=0` does not emit a child while `Rigid=2` does.

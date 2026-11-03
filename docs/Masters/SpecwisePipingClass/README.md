# Specwise Piping Class shards

This folder is generated from:

```text
../Piping_class_master.json
```

Generate or refresh the shard set with:

```bash
node tools/split-piping-class-master.mjs
```

The generator writes:

```text
index.json
<specKey>.json
```

Runtime behaviour:

1. XML branch names are scanned when an XML file is selected.
2. The app loads `index.json`.
3. For each class key in the index, the app performs simple normalized containment matching against branch names.
4. If a branch name contains a class key, only that class shard is fetched and loaded into the XML→CII piping-class master.

Example:

```text
index key: 91261
branch: /ASIM-1885-6"-S8810111-91261M7-HC
match: branch contains 91261
loaded shard: 91261.json
```

Piping-class branch matching intentionally does not use regex.

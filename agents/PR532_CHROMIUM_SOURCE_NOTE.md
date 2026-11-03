# PR532 Chromium Exact-Source Note

The Chromium execution used source fetched from the PR #532 branch through the GitHub connector because the execution sandbox has no outbound DNS and Chromium navigation is enterprise-policy blocked for `localhost`, `file:` and `data:` URLs.

Every reconstructed source file was checked with `git hash-object` against the GitHub blob SHA before injection into the real Chromium runtime. See `PR532_CHROMIUM_RECEIPT.md` for the exact hashes and assertion set.

No application formula or browser product behavior was replaced by a test-only calculation implementation.
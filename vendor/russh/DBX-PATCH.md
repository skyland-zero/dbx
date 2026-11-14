# DBX patch: russh 0.60.1 for the NSH GUI

This is the crates.io source of `russh` 0.60.1 with two source changes, used
only by `apps/nsh` (`apps/nsh/Cargo.toml` and
`apps/nsh/.cargo/config.toml` patch it in):

1. `src/keys/format/pkcs8.rs`: `RsaPrivateKey::try_from` spells the owned
   type (`RsaPrivateKeyOwned`) because `pkcs1` 0.8 made `RsaPrivateKey`
   generic.
2. `src/keys/format/pkcs8.rs`: `Parameters::pbkdf2_sha256_aes256cbc` is now
   `generate_pbkdf2_sha256_aes256cbc` in `pkcs5` 0.8.1.

Why 0.60.1: nsh's QuickJS runtime enables `quickjs-jit-stdlib/crypto`, which
requires stable `ecdsa` / `rsa` / `pkcs8`. `russh` 0.60.3 pins
`ecdsa = 0.17.0-rc.16`, so Cargo resolves 0.60.1 inside nsh's generated
workspace. The two changes let 0.60.1 compile against the stable
`pkcs1`/`pkcs5` that the same graph selects.

Remove this directory and the two patch lines once nsh's runtime no longer
forces the stable crypto graph (or dbx moves to a russh release that supports
it).

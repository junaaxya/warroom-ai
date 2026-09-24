# Referensi Command

[Bahasa Inggris](../COMMAND-REFERENCE.md) | **Bahasa Indonesia**

## Instalasi

```bash
warroom version
warroom setup
warroom doctor-install
```

## Project registry

```bash
warroom add <alias> <project-path>
warroom projects
warroom use <project|alias|.>
warroom active
```

## Onboarding

```bash
warroom onboard <alias> <policy-json-file>
```

## Runtime

```bash
warroom up [project|alias|.]
warroom down [project|alias|.]
warroom status [project|alias|.]
warroom doctor [project|alias|.]
```

## Divisions / Bridge

```bash
warroom frontend [project|alias|.]
warroom backend  [project|alias|.]
warroom bridge   [project|alias|.]
```

## Attach

```bash
warroom attach frontend [project|alias|.]
warroom attach backend  [project|alias|.]
warroom attach bridge   [project|alias|.]
```

## Cockpit

```bash
warroom cockpit [project|alias|.]
```

Cockpit menggunakan `opencode attach <url> --dir <project> --session <session-id>` terhadap Frontend dan Backend server yang sudah berjalan.

# Model Keamanan

[Bahasa Inggris](../SECURITY.md) | **Bahasa Indonesia**

## Write enforcement

Urutan evaluasi path saat ini:

```text
protected.paths
→ division deny_write
→ shared paths yang memerlukan coordination
→ division-owned write paths
→ default deny
```

Pola mutasi shell yang umum juga diblokir untuk War Room divisions sehingga perubahan source diarahkan melalui editing tools yang memahami policy.

## Bukan OS sandbox

War Room adalah workflow enforcement, bukan operating-system sandbox.

Jangan mengklaim bahwa War Room dapat menahan program native berbahaya, hostile users, compromised plugins, atau proses arbitrer yang memiliki akses filesystem normal.

## Read access

Write protection tidak berarti read isolation. Jika project policy memberikan read access yang luas, protected files masih dapat dibaca.

Untuk isolasi secret yang lebih kuat, simpan secrets di luar worktree yang dapat dilihat agent atau tambahkan model read-deny khusus pada release mendatang.

## Secrets

Jangan commit runtime API keys, tunnel credentials, database passwords, production secrets, atau private keys.

Permission yang direkomendasikan:

```bash
chmod 600 ~/.config/warroom/config.json
chmod 600 /path/to/runtime-key
```

## Secure MCP Tunnel

OpenAI mendokumentasikan Secure MCP Tunnel sebagai cara menghubungkan MCP server private/local ke produk OpenAI yang didukung melalui outbound HTTPS tanpa membuka inbound public ports.

Referensi:

https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

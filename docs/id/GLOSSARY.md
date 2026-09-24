# Glosarium

[Bahasa Inggris](../GLOSSARY.md) | **Bahasa Indonesia**

**Active project** — project yang saat ini menjadi target Supervisor global.

**Alias** — nama project yang mudah dibaca manusia dan didaftarkan dengan `warroom add`.

**Bridge** — service lokal per-project yang menghubungkan Supervisor dan division sessions.

**Cockpit** — tampilan tmux yang menunjukkan Frontend dan Backend attach clients secara berdampingan.

**Coordination** — lifecycle approval/reservation yang diperlukan sebelum perubahan semantic pada shared path.

**Division** — engineering role independen; default saat ini adalah Frontend dan Backend.

**Guard** — plugin OpenCode global yang menegakkan project path policy.

**Handoff** — ringkasan project persistent yang menyimpan goal, completed work, issues, decisions, verification, dan next action.

**Pinned session** — OpenCode session ID stabil yang disimpan dalam project state dan digunakan kembali setelah restart.

**Project ID** — identifier unik berdasarkan basename project ditambah canonical-path hash.

**Protected path** — path yang ditolak untuk write pada workflow War Room normal.

**Shared path** — path yang memerlukan coordination sebelum perubahan semantic.

**Supervisor** — control plane yang menghadap ke ChatGPT untuk planning, delegation, review, verification, dan handoff.

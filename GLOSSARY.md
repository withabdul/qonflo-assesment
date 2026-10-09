# Mini Task Manager

Aplikasi internal untuk mengelola task sederhana, dengan fokus pada kejelasan siapa mengubah apa dan kapan.

## Language

**Task**:
Satu unit pekerjaan dengan judul dan Status. Dapat dihapus dari daftar, tetapi riwayatnya tetap ada.
_Avoid_: Ticket, item, todo

**Status**:
Posisi sebuah Task dalam alur kerja: `to_do`, `pending`, `in_progress`, `done`.
_Avoid_: State, stage

**Transition**:
Perpindahan Status satu langkah maju sesuai urutan alur. Loncat, mundur, atau keluar dari `done` tidak diperbolehkan.
_Avoid_: Move, step

**Actor**:
Pengguna dari daftar tetap yang melakukan sebuah perubahan, dipilih lewat dropdown.
_Avoid_: User, editor, changer

**Audit Log**:
Catatan permanen satu perubahan pada sebuah Task: Task mana, Actor siapa, dari Status apa ke Status apa, dan kapan. Tidak pernah diubah atau dihapus.
_Avoid_: History, event, activity

**Creation Entry**:
Audit Log pertama sebuah Task, tanpa Status asal, ke `to_do`.
_Avoid_: Initial log

**Deletion Entry**:
Audit Log yang mencatat Task dihapus dan oleh siapa.
_Avoid_: Removal log

**Idempotent Update**:
Permintaan mengubah Status ke nilai yang sudah berlaku. Diterima tanpa membuat Audit Log baru.
_Avoid_: Duplicate update, no-op change

# #niahematin: Product Requirements Document v3

Draft v3 · 12 Oktober 2026 · Proyek pribadi, 1 pengguna · Scope: Fase 1 (bot Telegram saja)

\#niahemat memberi tahu satu mahasiswa, setiap hari, berapa dari jatah Rp 2.000.000 yang aman dipakai, supaya makan tetap di bawah Rp 1.000.000, Bibit dan dana HP tidak tersentuh, dan HP pengganti benar-benar terbeli.

## 0. Apa yang berubah dari v2

- **Kalibrasi dulu, kunci angka belakangan.** Rp 1 juta untuk makan dan 3,3 small buy per minggu masih tebakan dari ingatan. Bot jalan dalam mode kalibrasi sebelum aturan dikunci (bagian 7).
- **HP sekarang urgensi, bukan cita-cita.** HP lag dan tombol power susah ditekan, jadi target 30 sampai 50 bulan tidak masuk akal. Ada target bertingkat dan opsi Turbo HP (bagian 3).
- **Pot baru: Tagihan tetap.** Pulsa, paket data, dan langganan dibayar sendiri tapi tidak ada di v2.
- **Groceries tidak lagi memicu omelan.** Belanja besar tidak menjatuhkan limit harian (bagian 4).
- **Fitur baru: /boleh.** Bot menjawab sebelum uang keluar, bukan sesudahnya.
- **Overspend Needs tidak bisa disembunyikan.** Ditutup dari pot mana pun, tetap tercatat sebagai overspend Needs.
- **Sapuan akhir bulan jadi default-on.** Sisa uang tidak pernah kembali menjadi uang bebas.
- **Guardrail anti-mute.** Maksimal 1 peringatan per hari, ada pujian, dan ada jam tenang.
- **Dashboard dipindah ke Fase 2.** Fase 1 hanya bot.
- Bagian Danger Mode dan /pinjam tidak ikut terkirim waktu review, jadi ditulis ulang di sini (5.3 dan 5.5). Ganti kalau versi aslimu lebih baik.

## 1. Masalah, tujuan, dan metrik

Jatah dari orang tua masuk tanggal 1. Saldo penuh di awal bulan terasa aman, lalu banyak pembelian kecil (sekitar Rp 15.000, lebih dari sepuluh kali sebulan) menguras saldo tanpa terasa. Di akhir bulan uang kurang dan selisihnya ditutup dari tabungan. Selama ini tidak ada pencatatan sama sekali, jadi tidak ada yang bisa dilihat, apalagi dikoreksi.

Root cause-nya bukan kurang niat, tapi **keputusan belanja tidak terlihat saat terjadi**. Produk ini mengubah itu: angka yang relevan muncul tepat sebelum dan sesudah uang keluar.

| Metrik | Target (3 bulan setelah plan aktif) | Cara ukur |
| --- | --- | --- |
| Needs (makan + groceries) | ≤ Rp 1.000.000 tiap bulan | Total pengeluaran Needs, siapa pun yang menanggung |
| Pinjam dari tabungan | 0 kali selama 3 bulan berturut | Jumlah /pinjam dan /utang |
| Limit makan harian | Dipatuhi ≥ 70% hari | Hari dengan pengeluaran makan ≤ limit hari itu |
| Small buy | Dalam jatah di ≥ 3 dari 4 minggu | Lihat aturan small buy (bagian 4) |
| Logging coverage | ≥ 90% hari | Hari punya minimal 1 log atau no-spend yang dikonfirmasi |
| Dana HP | Sesuai tier dan tanggal target | Saldo goal HP di Bibit vs rencana |
| Drift | Rata-rata ≤ Rp 20.000 per cek mingguan | Selisih saldo Mandiri vs hitungan bot |

Logging coverage adalah metrik prasyarat. Kalau ini jatuh, semua metrik lain tidak bisa dipercaya. **Aturan pivot:** kalau coverage di bawah 60% pada akhir minggu ke-3 kalibrasi, jangan tambah fitur. Sederhanakan input (misalnya hanya satu catatan malam hari) sebelum lanjut.

## 2. Pengguna, fakta, dan asumsi

| Hal | Status |
| --- | --- |
| Mahasiswa tanpa pekerjaan, satu-satunya pemasukan Rp 2.000.000 dari orang tua tiap tanggal 1 | Terkonfirmasi |
| Jatah masuk ke Mandiri, yang juga rekening belanja. Semua pembayaran lewat QRIS dari Mandiri | Terkonfirmasi |
| Tinggal dengan orang tua, tapi membayar sendiri makan, groceries, pulsa, paket data, dan langganan | Terkonfirmasi |
| Bibit = tabungan bebas, bukan dana darurat | Terkonfirmasi |
| HP sekarang lag dan tombol power susah ditekan. Target: HP pengganti | Terkonfirmasi |
| Kebiasaan yang mau dihentikan: pinjam dari tabungan di akhir bulan | Terkonfirmasi |
| Pengeluaran makan dan groceries sebenarnya per bulan | **Tidak diketahui** (dikalibrasi) |
| Besaran pulsa, paket data, dan langganan | **Tidak diketahui** (audit di Fase 0) |
| Transport Rp 150.000 per bulan | Asumsi (dikalibrasi) |

Bahasa bot: Indonesia santai gen z dan bersahabat yang mendorong hidup hemat. Zona waktu Asia/Jakarta (WIB). Karena semua uang lewat Mandiri dan QRIS, di v1 tidak ada e-wallet, tunai, atau PayLater (lihat 5.7 dan 5.9 kalau terpaksa).

## 3. Rencana bulanan

Plan dibuat otomatis saat jatah dikonfirmasi masuk. Rp 500.000 harus keluar dari Mandiri di hari 1, jadi yang bisa dipakai hanya Rp 1.500.000.

| Pot | Rp | Porsi | Aturan |
| --- | --- | --- | --- |
| Needs: makan dan groceries | 1.000.000 | 50% | Hard cap. Makan siap beli punya limit harian. Groceries target awal Rp 300.000 (tebakan). |
| Bibit (tabungan bebas) | 300.000 | 15% | Keluar dari Mandiri di hari 1. |
| Dana HP | 200.000 | 10% | Keluar dari Mandiri di hari 1, goal terpisah di Bibit. |
| Tagihan tetap (pulsa, paket data, langganan) | 100.000 | 5% | Tebakan, ganti setelah audit. Dicatat otomatis (5.1). |
| Transport | 150.000 | 7,5% | Peringatan di 80% dan 100%. |
| Fun dan nongkrong | 100.000 | 5% | Small buy non-makanan masuk sini. |
| Other needs (perawatan diri, kuliah, baju, hewan) | 50.000 | 2,5% | Peringatan di 80% dan 100%. |
| Buffer | 100.000 | 5% | Reset tiap bulan. Cadangan terakhir. |
| **Total** | **2.000.000** | **100%** |  |

Semua angka bisa diedit, dan perubahan berlaku mulai bulan berikutnya. Setelah kalibrasi, angka ini diganti dengan data nyata.

**Urutan overflow.** Kalau sebuah pot habis, bot mengambil dari **Fun dulu, Buffer terakhir**. Dengan begitu overspend langsung terasa (jatah nongkrong berkurang) dan Buffer tetap utuh untuk kejadian benar-benar tak terduga. Bibit hanya bisa disentuh lewat /pinjam. Dana HP **tidak bisa dipinjam sama sekali**.

**Aturan jujur untuk Needs.** Pengeluaran Needs di atas Rp 1.000.000 selalu dicatat sebagai *overspend Needs*, meski ditutup dari Fun atau Buffer. Metrik Needs ≤ Rp 1 juta tidak bisa lolos lewat tambal-sulam.

### HP: dari cita-cita jadi rencana

HP kamu sudah bermasalah sekarang, jadi horizon 30 sampai 50 bulan di v2 tidak realistis. Rencananya bertingkat:

- **Tier 0: cek servis.** Minggu ini, tanya harga ganti tombol power atau baterai. Perbaikan sering jauh lebih murah dari HP baru. Ini langkah pertama sebelum menabung apa pun.
- **Tier 1: HP bekas atau refurbished yang layak.** Contoh target Rp 3.000.000 (ganti sesuai hasil risetmu).
- **Tier 2: HP impian Rp 6 sampai 10 juta.** Tetap ada di wishlist, tapi bukan target pertama.

**Turbo HP (disarankan).** Selama Tier 1 belum tercapai, porsi Bibit turun dari Rp 300.000 jadi Rp 100.000 dan dana HP naik jadi Rp 400.000. Total tabungan tetap Rp 500.000 dan tetap keluar di hari 1. Sapuan akhir bulan juga 100% ke HP. Setelah Tier 1 tercapai, porsi kembali normal. Ini tabunganmu sendiri dan Bibit-mu bebas, jadi ini murni soal prioritas.

| Target | Rp 200rb/bln (v2) | Rp 400rb/bln (Turbo) | Turbo + sapuan Rp 150rb |
| --- | --- | --- | --- |
| Tier 1: Rp 3 juta | 15 bulan | sekitar 8 bulan | sekitar 6 bulan |
| Rp 6 juta | 30 bulan | 15 bulan | sekitar 11 bulan |
| Rp 10 juta | 50 bulan | 25 bulan | sekitar 18 bulan |

Opsi lain yang perlu dipikirkan: bicara dengan orang tua soal patungan HP (mereka melihat sendiri HP-mu bermasalah), atau pemasukan kecil tambahan. Mengencangkan jajan Rp 12.000 saja tidak akan menutup selisih sebesar ini.

Resiko Bibit: nilai dana bisa turun dan pencairan butuh beberapa hari. Cek profil risiko tiap produk sendiri. Untuk uang yang akan dipakai dalam 6 sampai 12 bulan, pilih produk yang sesuai horizon. PRD ini bukan nasihat keuangan.

## 4. Aturan inti dan rumus

**Hari berganti jam 03.00 WIB**, supaya jajan jam 1 pagi masuk hari yang sama. **Minggu = Senin sampai Minggu.** Untuk metrik bulanan, minggu dihitung ke bulan tempat hari Seninnya jatuh.

- **Needs Left** = 1.000.000 − makan spent − groceries spent.
- **Groceries Reserve** = max(0, target groceries − groceries spent).
- **Makan Left** = Needs Left − Groceries Reserve.
- **Daily Limit** (makan siap beli) = Makan Left di awal hari ÷ sisa hari bulan ini (termasuk hari ini). Dihitung ulang tiap pagi.
- **Batas atas limit** = 1,25 × limit dasar (limit dasar dihitung di hari 1). Kalau hemat berhari-hari, limit tidak melonjak jadi izin boros. Sisanya masuk jalur sapuan.
- **Survival floor** = 60% dari limit dasar. Kalau limit hari ini atau proyeksi besok di bawah floor, bot masuk Danger Mode (5.3).
- **Small buy**: pembelian kategori Jajan (makanan atau minuman beli jadi) atau Random (barang acak) sampai Rp 50.000. Kategori yang menentukan, bukan nominal, jadi tidak ada tebing di Rp 30.000. Pembelian di atas Rp 50.000 bukan small buy dan wajib lewat /boleh.
- **Small Buy Budget**: 3 per minggu dan Rp 60.000 per minggu (dikalibrasi setelah 2 minggu data).
- **HP days** = overspend ÷ (kontribusi HP per bulan ÷ 30). Bot menampilkannya sebagai **counter bulanan kumulatif**, bukan angka per kejadian: “Bulan ini jajanmu bikin HP mundur 9 hari.” Hemat juga dihitung: “Kamu batal beli 3x, HP maju 4 hari.”
- **Drift** = saldo Mandiri yang diharapkan − saldo Mandiri sebenarnya. Menunjukkan uang yang keluar tanpa dicatat.
- **Pot lain** (Transport, Fun, Other, Tagihan): tampil sebagai “Rp sisa” saja, tanpa limit harian.

**Contoh hitung (bulan 30 hari, angka tebakan).** Groceries Rp 300.000, jadi makan Rp 700.000 dan limit dasar Rp 23.333.

- Hari 3 belanja bulanan Rp 150.000: Needs Left turun Rp 150.000, tapi Groceries Reserve juga turun Rp 150.000. Makan Left tidak berubah dan limit tetap sama. Bot tidak menyalak.
- Hari 1 jajan Rp 30.000: limit hari 2 jadi (700.000 − 30.000) ÷ 29 = Rp 23.103. Overspend awal bulan terasa kecil karena dibagi banyak hari.
- Hari 25 sisa Makan Left Rp 80.000 untuk 6 hari: limit Rp 13.333, di bawah floor Rp 14.000. Danger Mode.

**Klasifikasi hangout, satu kalimat:** kalau kamu tetap akan makan itu tanpa teman, masuk Needs. Kalau acaranya yang kamu beli (ngopi, nonton, nongkrong), masuk Fun.

## 5. Fitur bot (Fase 1)

### 5.1 Mencatat

- Input cepat tanpa command. Ketik “15 kopi” dan bot mengerti nominal (15, 15rb, 15k, 15000) dan catatan, lalu menebak kategori dari kata kunci. Kalau ragu, tampil tombol kategori. Kategori: Makan, Groceries, Jajan, Random, Transport, Fun, Tagihan, Lain-lain.
- Setiap log dibalas satu baris data, bukan omelan: “✅ Rp 15.000 kopi (Jajan). Sisa limit hari ini Rp 8.000.”
- /undo membatalkan log terakhir. /edit mengubah nominal atau kategori.
- Pengeluaran di atas Rp 100.000 di luar Groceries memicu satu pertanyaan: dari pot mana?
- **Tagihan berulang.** Pulsa, paket data, dan langganan didaftarkan sekali (nama, nominal, tanggal). Bot mengirim “Spotify Rp 55.000 sudah ditagih?” dan satu ketukan mencatatnya.

### 5.2 /boleh: keputusan sebelum uang keluar

Fitur paling bernilai di PRD ini. Contoh: `/boleh 25000 boba`. Bot menjawab:

- sisa limit makan hari ini dan proyeksi limit besok,
- sisa jatah small buy minggu ini (jumlah dan rupiah),
- berapa hari HP mundur kalau jadi beli,
- verdict 🟢 aman, 🟡 sebaiknya jangan, atau 🔴 melewati limit,
- dua tombol: **Jadi beli (catat)** dan **Batal beli**.

Tombol Batal beli mencatat uang yang ditahan sebagai counter positif (“Minggu ini kamu batal beli 3x = Rp 75.000”), yang ikut masuk sapuan. Ini sumber pujian yang murah dan nyata.

### 5.3 Danger Mode

Masuk kalau limit hari ini atau proyeksi besok di bawah survival floor. Perilakunya:

1. Satu pesan masuk Danger Mode yang menyebut angka limit hari ini dan jumlah hari tersisa.
2. Pot Fun dibekukan. /boleh untuk small buy non-esensial otomatis 🔴.
3. Pesan pagi hanya berisi satu angka dan satu saran konkret (misalnya bawa bekal atau makan di rumah).
4. Pengingat bahwa /pinjam punya jeda 24 jam dan tidak dihitung bantuan: itu tetap pinjam.
5. Keluar otomatis kalau limit kembali di atas floor.

Danger Mode bukan kegagalan, hanya sinyal. Tidak ada hukuman tambahan.

### 5.4 Ritme harian dan mingguan

- **07.00 WIB, pesan pagi:** limit hari ini, sisa small buy minggu ini, counter HP bulan ini. Maksimal 4 baris.
- **20.30 WIB, cek malam:** tiga tombol: *Semua sudah dicatat*, *Ada yang lupa*, *Hari ini nggak keluar uang*. Tombol ketiga dihitung no-spend untuk coverage.
- **Minggu 19.00:** rekap mingguan dan permintaan /saldo (5.7).
- **Tidak ada log 3 hari:** satu pengingat lembut per hari, tanpa angka. **7 hari diam:** bot berhenti menyapa dan hanya bertanya: lanjut, ubah setelan, atau jeda?

### 5.5 /pinjam

Hanya untuk Bibit. Dana HP tidak bisa dipinjam.

1. `/pinjam 100000` → bot meminta alasan satu kalimat dan tanggal pengembalian.
2. Jeda 24 jam. Setelah itu bot bertanya sekali lagi: “Masih mau?”
3. Kalau lanjut, tercatat sebagai pinjaman dan **metrik nol-pinjam gagal bulan itu**. Karena Bibit tabungan bebas, tidak ada kategori “darurat sah” yang dikecualikan: itu menjaga angkanya jujur.
4. Pengembalian dipotong dari Fun lalu Buffer bulan berikutnya sampai lunas.

Pencairan Bibit butuh beberapa hari, itu sudah friksi alami. Jangan dibuat lebih mudah.

### 5.6 Uang masuk dan transfer hari 1

- `/masuk 2000000 jatah` mengonfirmasi jatah bulanan. Plan baru dibuat setelah ini. Kalau transfer telat atau jatuh di akhir pekan, bot menanyakan setiap pagi sampai ada konfirmasi. Hitungan sisa hari tetap pakai kalender.
- Pemasukan lain: `/masuk 100000 angpao`, `tambahan ortu`, `ganti utang`. Default-nya masuk sapuan ke dana HP, kecuali kamu memilih pot lain.
- **Konfirmasi transfer hari 1.** Bot tidak bisa menggerakkan Mandiri atau Bibit. Pagi hari 1 ia memberi daftar transfer (Bibit dan dana HP, total Rp 500.000) dengan tombol *Sudah transfer*. Sebelum dikonfirmasi, “spendable” yang ditampilkan tetap dihitung Rp 1.500.000 dan bot mengingatkan sekali per hari.

### 5.7 Rekonsiliasi (drift)

Setiap Minggu malam kamu kirim `/saldo 1234567` dari aplikasi Mandiri. Bot membandingkan dengan saldo yang diharapkan. Kalau selisih lebih dari Rp 20.000, bot bertanya apa yang lupa dicatat. Selisih yang tidak ketemu dicatat sebagai “tak terlacak” ke pot Needs. Karena semua pembayaran lewat QRIS dari Mandiri, drift di v1 bersih. Kalau suatu saat top up e-wallet atau tarik tunai, catat sebagai pengeluaran biasa di kategori tujuannya saat dana itu dibelanjakan. Dukungan penuh untuk e-wallet dan tunai ditunda ke fase berikutnya.

**Utang tersembunyi.** PayLater, cicilan, atau nalangin teman dicatat dengan `/utang` dan dihitung seperti /pinjam. Itu tetap meminjam dari uang masa depan.

### 5.8 Sapuan akhir bulan (default-on)

Tanggal 1, bot menjumlahkan sisa semua pot bulan lalu (Needs, Fun, Transport, Other, Tagihan, Buffer). Sisa itu **tidak ditambahkan ke jatah bulan baru**. Bot menyebutnya “uang karantina” dan menampilkan saldo Mandiri versus jumlah yang boleh dipakai. Default pembagian: 50% dana HP dan 50% Bibit, atau 100% HP selama Turbo HP aktif. Kamu tinggal transfer lalu tekan *Sudah*. Kalau belum ditekan, pengingat harian tanpa omelan. Membatalkan sapuan butuh aksi aktif, bukan diam.

### 5.9 Perintah lain dan kondisi HP

- `/sisa` ringkasan semua pot. `/rencana` melihat dan mengedit pot. `/ringkas` rekap minggu atau bulan. `/export` mengirim CSV semua transaksi.
- **Bot jalan di perangkat apa pun.** Tombol power HP-mu susah ditekan, jadi pakai Telegram Web atau Desktop di laptop bila perlu. Semua interaksi memakai teks pendek dan tombol, tanpa gambar atau lampiran berat. `/export` rutin menjaga data kalau HP mati total.

## 6. Tone dan guardrail anti-ngomel

Risiko terbesar proyek ini bukan rumus salah, tapi kamu mute bot-nya lalu coverage jatuh. Aturannya:

1. **Maksimal 1 peringatan proaktif per hari.** Urutan prioritas kalau lebih dari satu terpicu: Danger Mode, lalu limit harian, lalu small buy mingguan, lalu pot lain. Balasan atas perintahmu sendiri (log, /boleh) tidak dihitung peringatan.
2. **Jam tenang 22.00 sampai 06.30.** Tidak ada pesan proaktif.
3. **Pujian itu fitur.** Hari di bawah limit, streak, dan batal beli dirayakan singkat.
4. **Selalu ada angka dan satu langkah konkret.** Tidak ada ceramah.
5. **Tidak mempermalukan.** Tegas soal uang, hangat soal kamu.

Contoh nada:

- Pagi: “Pagi! Limit makan hari ini Rp 23.000. Small buy minggu ini sisa 2. HP sudah maju 3 hari bulan ini.”
- Over limit: “Hari ini lewat Rp 12.000, itu sekitar 2 hari tabungan HP. Besok limitnya Rp 22.700, masih aman. Bulan ini total HP mundur 4 hari.”
- Hari bagus: “Hari ketiga di bawah limit! Sisa Rp 9.000 hari ini ikut masuk sapuan HP.”

## 7. Fase dan jadwal

**Fase 0: persiapan (sebelum atau sambil build, sekitar 1 jam).**

- **Baseline dari mutasi.** Kamu bilang tidak pernah mencatat, tapi semua belanja lewat QRIS dari Mandiri, jadi riwayat transaksi di aplikasi Mandiri sudah mencatatnya. Buka 2 sampai 3 bulan terakhir, jumlahkan makan, groceries, transport, dan tagihan kasar. Ini lebih cepat dari menunggu 3 bulan data dan langsung memvalidasi Rp 1 juta.
- **Audit tagihan:** daftar semua langganan, pulsa, dan paket data beserta nominal dan tanggalnya.
- **Cek servis HP:** tanya harga ganti tombol power atau baterai (Tier 0).

**Fase 1a: kalibrasi (mulai begitu bot minimal jalan, minimal 14 hari).** Bot mencatat dan menjawab /boleh, tapi tidak mengomel, tidak ada Danger Mode, dan tidak ada limit yang dikunci. Di akhir, bot mengusulkan angka pot dari data nyata.

- Kalau baseline Needs ≤ Rp 1.000.000, cap tetap Rp 1 juta.
- Kalau lebih tinggi, pakai **glide path**: turun Rp 100.000 per bulan sampai Rp 1 juta, dan selisihnya diambil dari Fun dan Buffer, bukan dari Bibit atau dana HP.

**Fase 1b: plan aktif.** Target mulai 1 November 2026 (hari Minggu, jadi transfer ortu bisa telat). Syaratnya kalibrasi sudah jalan minimal 14 hari. Kalau belum, mulai 1 Desember.

**Fase 2: dashboard.** Dibangun dengan Vue 3 + Tailwind di Vercel (bagian 8) hanya kalau ada data 4 minggu dan ada pertanyaan nyata yang tidak terjawab oleh `/ringkas` dan `/export`.

## 8. Teknis ringkas

Satu proyek Node.js dan TypeScript: bot, API, dan dashboard (Fase 2) memakai logika uang yang sama. Fase 1 hanya membangun bot dan API minimal.

### Stack

| Lapisan | Pilihan | Catatan |
| --- | --- | --- |
| Bot | grammY (Node.js) | Dipilih dari Telegraf dan grammY karena TypeScript-nya rapi dan plugin conversations cocok untuk alur /pinjam. Fase 1 memakai long polling. |
| Backend | Node.js + Express.js | Fase 1: endpoint /health dan layer service yang dipakai bot. Fase 2: REST API untuk dashboard. |
| Database | SQLite lewat Prisma ORM | Satu pengguna, satu file, mudah di-backup. Pindah ke PostgreSQL cukup dengan mengganti provider Prisma. Uang disimpan sebagai integer rupiah. |
| Hosting backend | Ubuntu home server 24/7 dengan Docker Compose (restart: unless-stopped) | PM2 bisa jadi alternatif, tapi pilih salah satu, jangan dua-duanya. |
| Exposing | Cloudflare Tunnel (cloudflared) | Hanya perlu di Fase 2, agar Vercel bisa memanggil Express API di home server lewat HTTPS. Bot dengan long polling tidak butuh port masuk. |
| Frontend (Fase 2) | Vue 3 + Tailwind CSS + UI kit pribadi (Figma atau komponen localhost), di Vercel | Dibangun setelah data 4 minggu (bagian 7). |
| NLP | Parser aturan + fallback Claude API | Lihat di bawah. |
| Penjadwal | croner atau node-cron, zona Asia/Jakarta | Pesan pagi 07.00, cek malam 20.30, rollover 03.00, rekap Minggu. |
| Validasi dan tes | zod dan Vitest | Rumus bagian 4 dites dengan contoh hitungnya. |

### NLP untuk pencatatan teks bebas

Keputusan: parser bertingkat. Aturan dulu, model bahasa hanya cadangan. Input-nya pendek (“15 kopi”), domainnya sempit, dan penggunanya satu orang, jadi NLP berat seperti spaCy, Rasa, atau IndoBERT berlebihan.

1. **Nominal oleh regex, tidak pernah oleh LLM.** Mengenali 15, 15rb, 15k, 15.000, 1,5jt, dan slang seperti goceng (5rb) dan ceban (10rb) lewat kamus yang bisa kamu edit. Angka uang harus deterministik.
2. **Kategori lewat kamus kata kunci plus memori pribadi.** Setiap koreksi lewat tombol kategori disimpan (misalnya kopi → Jajan). Fuzzy match ringan seperti Fuse.js menangani typo (nasgor, kopii).
3. **Fallback LLM** kalau keyakinan rendah atau pesan berisi beberapa item (“15 kopi 20 nasgor”). Pakai Claude API lewat SDK TypeScript (@anthropic-ai/sdk) dengan model kelas Haiku (claude-haiku-5-5) supaya murah dan cepat. Keluarannya JSON yang divalidasi zod. Kalau gagal validasi, bot menampilkan tombol kategori manual.
4. **Privasi dan biaya.** Yang dikirim ke API hanya teks pendek pesan, tanpa saldo atau data lain. Ada batas panggilan harian dan flag env untuk mematikan fallback. Tanpa fallback, bot tetap jalan penuh.

dengan 50 pesan nyata sebagai fixture.

Target kualitas: ≥ 90% kategori benar tanpa koreksi setelah 2 minggu kalibrasi, diuji dengan 50 pesan nyata sebagai fixture.

### Arsitektur dan deployment

- **Struktur repo:** `core` (rumus murni: limit harian, floor, sapuan, HP days), `bot`, `api`, dan nanti `web`. Bot dan API memanggil `core` yang sama, jadi angka di dashboard tidak bisa beda dari angka di bot.
- **Long polling di Fase 1.** Home server tidak membuka port. Telegram menyimpan update yang belum diambil sampai 24 jam, jadi pesan yang masuk saat server mati tidak hilang kalau server menyala kembali dalam sehari.
- **Penjadwal idempoten.** Status tiap job disimpan di database. Setelah restart, pesan pagi atau cek malam yang terlewat dikejar satu kali, tidak dobel. Log yang dikirim ulang oleh Telegram tidak boleh tercatat dua kali.
- **Cloudflare Tunnel (Fase 2).** Butuh domain di Cloudflare untuk named tunnel (quick tunnel tidak untuk produksi). API hanya menerima CORS dari domain Vercel, dengan login lewat tautan sekali pakai yang dikirim bot lewat `/dashboard`, lalu JWT berumur pendek, plus rate limit.
- **Home server = titik tunggal gagal.** Listrik atau internet mati berarti tidak ada pesan pagi. Server mengirim heartbeat ke layanan luar (misalnya Healthchecks.io) dan kamu mendapat email kalau berhenti.
- **Keamanan:** bot hanya menjawab ID Telegram-mu (whitelist), rahasia di .env, jangan pernah menghubungkan kredensial Mandiri. Obrolan bot Telegram tidak end-to-end encrypted, jadi jangan kirim nomor rekening.
- **Backup:** salinan SQLite tiap malam, dienkripsi dan disimpan di luar home server, plus CSV mingguan lewat `/export`.

## 9. Risiko

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Rp 1 juta makan tidak realistis | Danger Mode di hari 10, kamu benci botnya | Kalibrasi, baseline mutasi, glide path |
| Kamu berhenti mencatat atau mute bot | Semua metrik tidak valid | Input 1 langkah, cek malam, guardrail anti-ngomel, aturan pivot minggu ke-3 |
| HP rusak total sebelum dana cukup | Bot tidak bisa diakses | Telegram Web di laptop, ekspor rutin, Tier 0 dan Tier 1 |
| Tebakan groceries, tagihan, dan transport salah | Limit harian meleset | Dikalibrasi, bukan dikunci |
| Motivasi turun karena horizon HP panjang | Proyek ditinggalkan | Tier bertingkat, progress bar milestone, Turbo HP, counter maju |
| Sapuan diabaikan | Sisa uang terasa bebas lagi | Default-on, uang karantina, pengingat harian |
| Home server mati (listrik atau internet) | Tidak ada pesan pagi dan cek malam, log tertunda | Long polling (update tertahan sampai 24 jam), job catch-up saat menyala, heartbeat eksternal, backup di luar server |

## 10. Keputusan terbuka

1. **Turbo HP: ya atau tidak?** Rekomendasi: ya sampai Tier 1 tercapai.
2. **Harga Tier 1.** Rp 3 juta hanya contoh. Isi setelah riset HP bekas atau refurbished.
3. **Patungan dengan orang tua** untuk HP: layak ditanyakan atau tidak?
4. **Pembagian sapuan** di luar Turbo: 50/50 atau lain?
5. **Ambang /boleh:** kapan 🟡 berubah jadi 🔴? Default: 🟡 kalau melewati sisa jatah small buy, 🔴 kalau melewati limit makan hari ini.

## 11. Di luar scope Fase 1 (diparkir)

Dashboard web, dukungan penuh e-wallet dan tunai, impor otomatis mutasi, multi-user, OCR struk, wishlist selain HP, dan notifikasi lewat kanal selain Telegram.

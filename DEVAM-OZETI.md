# Man Run — Devam Özeti (yeni oturum için)

Son güncelleme: 2026-10-13. Canlı sürüm: **v0.2.0**.

## Proje

- **Klasör:** `D:\GitRepo\9_Project_Claude\Man_Run`
- **Repo:** `codder-ctrl/man-run` (herkese açık). `main` dalı = canlı sürüm.
- **Canlı adres:** https://codder-ctrl.github.io/man-run/ (GitHub Pages, her `main` push'unda yayınlanır).
- **Ne:** Fun Run benzeri yan kaydırmalı koşu yarışı. 4 hayvan (sen + 3 bilgisayar) kendi kendine koşar. Oyuncu zıplar ve "?" kutularından çıkan eşyaları kullanır.
- **Kullanıcının isteği:**
  - Fun Run'a ne kadar benzerse o kadar iyi.
  - Arkadaşlarla lokal oynanacak.
- **İki plan (kullanıcı, 2026-10-13):**
  1. Oyunu birlikte geliştirmeye devam etmek.
  2. Arkadaşlarla oynanabilir yapmak (çok oyunculu; kullanıcı önce Bluetooth demişti). Henüz başlanmadı.
- **Ayrıntılar:** Mimari ve test ipuçları `CLAUDE.md` içinde.

## Puan geçmişi

**v0.1.0, kullanıcının puanları:**

| Akıcılık | Grafik | Efektler | Ses | Oynanış |
|---|---|---|---|---|
| 5 | 3 | 4 | 4 | 5 |

**Şikâyetler:**

- Harita dümdüz.
- Tek harita var.
- Derinlik hissi yok.
- Efektler ucuz duruyor.
- Sesler kulak tırmalıyor.
- Müzik baş ağrıtıyor.

**v0.2.0 bu şikâyetlere cevap olarak yapıldı.** Kullanıcının puanı bekleniyor.

## v0.2.0'da olanlar (görsel tur)

- **Kıvrımlı harita:**
  - Tepeler, vadiler, dalgalı tümsekler, yokuştan çukura iniş.
  - Bütün zemin hafifçe dalgalanıyor.
  - Yokuş yukarı yavaş, aşağı hızlı koşuluyor.
  - Karakterler eğime göre öne veya arkaya eğiliyor.
- **Derinlik (2.5D):**
  - Bulanık uzak dağlar, tepeler, ağaç sırası.
  - Pistin arkasında puslu bir toprak duvar; çukurlardan bakınca vadi gibi görünüyor.
  - Taş dokulu, derine indikçe kararan zemin ve kalın çimen kenarı.
  - Karakterlerin önünden kayan bulanık bitkiler.
- **3 harita:**
  - Orman: yapraklar uçuşuyor.
  - Karlı Dağ: kar yağıyor, buz sarkıtları, buz bloklar, kardan adam.
  - Çöl: masa dağlar, kum rüzgârı, kaktüsler.
  - Menüden seçiliyor; "Karışık" her yarışta rastgele seçer.
- **Efektler:**
  - Şimşek: dallanan şimşek, karakterler röntgen iskeletine dönüşüyor (Fun Run'daki gibi).
  - Hız: hayalet iz bırakıyor, kamera biraz uzaklaşıyor.
  - Vuruş: "POW" patlaması, ekran sarsıntısı ve kısa donma.
  - Kutular: kırmızı "?" kutusu, kırılınca parçalar ve parıltı.
  - Testere: kıvılcım saçıyor.
  - Bitiş: havai fişek.
  - Eşya düğmesinde renkli yuvarlak simgeler.
- **Ses:** Yumuşak tınılar, zil sesleri ve yankı. Her haritanın kendi tonunda sakin, akıcı bir müziği var.
- **Akıcılık:**
  - Kare zamanlaması ekranın yenileme hızına göre bölünüyor, takılmıyor.
  - Kamera daha sabit.
  - Yavaş telefonda oyun çözünürlüğü kendisi düşürüyor.

## Öğrenilenler

- **Taşları tek tek çizme:** Zemin parçaları önbelleğe çizilirken her taşı ayrı çizmek, parça başına 100 ile 1300 ms donmaya yol açtı. Çözüm: taş dokusu bir kez desen olarak hazırlanıyor ve tekrar kullanılıyor.

## Fikir listesi (kullanıcıyla konuşulacak)

- **Bluetooth / yerel çok oyunculu:** Web Bluetooth tarayıcıda sınırlı. Büyük ihtimalle aynı Wi-Fi + QR kod ile bağlanma daha uygun; kullanıcıya sorulacak.
- **Kostümler ve mağaza:** Fun Run'daki gibi şapkalar ve altın.
- **Yeni eşyalar:** Mıknatıs, yumruk, roket (Fun Run 3'te var).
- **Menü:** Arka planı canlı harita olsun.

# Man Run — Devam Özeti (yeni oturum için)

Son güncelleme: 2026-10-14. Canlı sürüm: **v0.5.0**. Yerelde hazır: **v0.6.0** (nişanlı mavi pati; "yükle" bekleniyor).

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
  2. Arkadaşlarla oynanabilir yapmak. v0.3.0'da yapıldı (oda kodu). Kullanıcının telefonlarda denemesi bekleniyor.
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

**v0.2.0 bu şikâyetlere cevap olarak yapıldı.**

**v0.2.0, kullanıcının puanları** (kullanıcı puanlarını `admin_puan.xlsx` dosyasında tutuyor; dosya .gitignore'da, yayınlanmıyor):

| Akıcılık | Grafik | Efektler | Ses | Oynanış |
|---|---|---|---|---|
| 5 | 6 | 7 | 6 | 5 |

**Notları:**

- Akıcılık: Hâlâ Fun Run kadar akıcı değil, mekaniklerin gelişmesi gerekiyor.
- Grafik, efektler, ses: Şimdilik iyi, sonra geliştirilecek.
- Oynanış: **Eğilme** ve her karakterin kendi **mavi pati yeteneği** (hızlanma yeteneği) eklenecek.

**v0.4.0, kullanıcının puanları** (2026-10-14; "Neden" notları v0.2'dekilerle aynı kaldı):

| Akıcılık | Grafik | Efektler | Ses | Oynanış |
|---|---|---|---|---|
| 5 | 6 | 7 | 7 | 5,5 |

- **Akıcılık hâlâ 5:** Sürekli tekrarlanan şikâyet "Fun Run kadar akıcı değil, mekanikler gelişmeli". Sıradaki geliştirme turunda öncelik bu olmalı; kullanıcıya neyin akıcı gelmediğini somut sor.

**Sıra (kullanıcı, 2026-10-13):** Önce arkadaşlarla oynanabilir hale getirmek, sonra oyunu geliştirmek (eğilme, mavi pati, akıcılık).

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

## v0.3.0'da olanlar (arkadaşla oyna)

- **Bluetooth neden yok:** Telefon tarayıcıları Bluetooth ile iki telefonu bağlayamıyor (Android'de tarayıcı görünür olamıyor, iPhone'da hiç yok). Kullanıcı **oda kodunu** seçti. Boş yerlere bot konup konmayacağını **oda kuran seçiyor**.
- **Nasıl oynanıyor:**
  - Menü → "Arkadaşla Oyna" → adını yaz → "Oda Kur" ya da 4 harfli kodu yazıp "Katıl".
  - Bekleme odasında 4 kart var. Kendi kartına dokunarak hayvanını değiştirebilirsin.
  - Oda kuran haritayı ve botları seçip "BAŞLAT"a basar.
- **Yarış sırasında:**
  - Yarışı oda kuranın telefonu yönetir: eşyalar, vuruşlar, kutular, sıralama.
  - Herkes kendi zıplamasını kendi telefonunda anında yapar.
  - Etiketlerde arkadaşların adları görünür.
- **Sonrası:**
  - Sonuç ekranında oda kuran "Tekrar Yarış" ya da "Lobiye Dön" seçer.
  - Ayrılan ya da 5 saniye sessiz kalan arkadaşın yerine bot geçer. Oda kuran çıkarsa oda kapanır.
- **Bağlantı:** PeerJS'in ücretsiz sunucusu yalnızca telefonları tanıştırıyor; oyun verisi telefondan telefona akıyor. Bağlanırken internet gerekiyor.
- **Test:** İki tarayıcı sekmesiyle gerçek bağlantıda denendi. Çalışanlar:
  - Kur, katıl, yarış, eşya kullanma, vurulma
  - Ayrılınca yerine bot geçmesi
  - Sonuç ekranı, tekrar yarış, lobiye dönüş
  - Yanlış kod uyarısı

## v0.4.0'da olanlar

- **Telefona yükleme:** Kullanıcı telefonda "indiremedim" dedi.
  - Menüye **📲 Telefona Yükle** düğmesi eklendi. Android'de tek dokunuşla yükler.
  - Tek dokunuş olmayan yerlerde (iPhone Safari, Samsung Internet, Instagram/Telegram gibi uygulama içi tarayıcılar) adım adım anlatım gösterir.
  - Uygulama bilgisi `display: standalone` + `display_override: fullscreen` oldu.
- **Eğilme:**
  - **EĞİL** düğmesi (zıplamanın yanında) basılı tutulunca karakter geriye yatıp ayaklarıyla kayar. Havadayken hızla yere iner.
  - Pistte yeni engel: **alçak kaya tavanı**. Önünde sarı uyarı tabelası var. Üstünden atlanamaz, altından kayılır. Botlar da kayıyor; geç kalırsa takılıyor.
- **Mavi pati:**
  - 🐾 düğmesi 15 saniyede dolar. Dolunca parlar, dokununca karakter hızlanır.
  - Arkasında mavi hayalet izler ve yerde mavi pati izleri kalır, üstünde yeteneğin adı çıkar.
  - Her hayvanın kendi yeteneği var; hepsi aşağı yukarı aynı mesafe kazandırıyor:

    | Hayvan | Yetenek | Tarzı |
    |---|---|---|
    | Tilki | Tilki Atılışı | kısa, çok hızlı |
    | Ayı | Ayı Gücü | uzun, güçlü |
    | Tavşan | Tavşan Sıçrayışı | çevik |
    | Kurt | Kurt Koşusu | dengeli |
    | Kedi | Kedi Çevikliği | hızlı |
    | Panda | Bambu Rüzgârı | uzun soluklu |

  - Menüde seçili hayvanın yeteneği yazıyor. Botlar da kullanıyor, çevrim içi oyunda da çalışıyor.

## v0.5.0'da olanlar (kullanıcının istekleri, 2026-10-14)

- **Duvara tırmanma:**
  - Duvara çarpan karakter tutunup tırmanır, tepede küçük bir sıçrayışla üstüne çıkar.
  - Zıplamayı basılı tutarsan iki kat hızlı tırmanır.
  - Çukurun karşı kenarını az farkla kaçırırsan kenara tutunur.
  - Kaya tavanlarına tırmanılmaz.
- **Zıplama ve kayma cezası:** Zıpladıktan sonra havadayken ve kayarken en yüksek hız 0,8'e düşer. En geniş çukurlar 145'e daraltıldı.
- **Tek dokunuşla eğilme:**
  - EĞİL'e bir kez dokununca 0,7 saniye kayar, sonra kendisi kalkar.
  - Tavanın altındaysa tavandan çıkana kadar eğik kalır.
  - Havadayken dokunursa hızla iner ve kayarak devam eder.
- **Kişiye özel kutular:**
  - Her yerde tek kutu var (art arda 3-4 kutu kalktı), yaklaşık her 800 birimde bir.
  - Kutuyu alan sadece kendi ekranında kaybeder; herkes aynı kutuyu alır.
  - Tek kişilikte de, arkadaşla oynarken de böyle. Yarış başına eşya kullanımı 8'den 35-40'a çıktı.
- **Takılma:** Kalite düşürmesi artık yarışın ortasında olmuyor (bir sonraki yarışta ya da geri sayımda uygulanıyor). Telefonlar baştan bir kademe hafif başlıyor. Duvarlarda durma da tırmanmayla çözüldü.
- **README:** Slasher Hero gibi yazıldı. En üstte "▶ Play Man Run" linki var. Repo sayfasının "About" kısmına da canlı adres eklendi.
- Gizli sekmede ekran boyutu 0 görünürken oyunun çökmesi düzeltildi.

## v0.6.0'da olanlar (nişanlı mavi pati, kullanıcının isteği)

- **Nişan:** 🐾 dolunca basılı tutup parmağını kaydırırsın. Brawl Stars'taki gibi: basılan noktadan parmağa giden yön nişan olur. Düğmenin içindeki top parmağı takip eder.
- **Sadece nişan alanın ekranında:** Karakterden çıkan nefes alan mavi bir ok, gideceğin yolu gösteren noktalı rota ve nişan aralığını gösteren soluk bir yay. Rota fizikle önceden hesaplanıyor; gerçek atılış onu birebir izliyor (en fazla 5 birim fark).
- **Herkesin gördüğü:** Karakterin ön kolu nişan yönünü gösterir, elinde parlayan mavi bir top olur. Arkadaşlar ve botlar da canlı görür.
- **Bırakınca:**
  - O yöne 0,22 saniyelik bir atılış (yerçekimi yok), sonra normal pati hızlanması devam eder.
  - Yukarı: duvar ve çukurların üstünden uçar (normal zıplamadan yaklaşık 1,35 kat yüksek).
  - İleri: yerde atılış.
  - Havada aşağı: dalış.
  - Kısa dokunuş düz ileri atar.
- **Klavye:** Q'yu basılı tut, ↑/↓ ile nişan al, bırak.
- **Botlar:** Kısa bir süre görünür şekilde nişan alıp en uzağa götüren güvenli açıyı seçiyorlar (çoğunlukla ileri, bazen yukarı).

## Öğrenilenler

- **Taşları tek tek çizme:** Zemin parçaları önbelleğe çizilirken her taşı ayrı çizmek, parça başına 100 ile 1300 ms donmaya yol açtı. Çözüm: taş dokusu bir kez desen olarak hazırlanıyor ve tekrar kullanılıyor.

## Fikir listesi (kullanıcıyla konuşulacak)

- **Bluetooth / yerel çok oyunculu:** Web Bluetooth tarayıcıda sınırlı. Büyük ihtimalle aynı Wi-Fi + QR kod ile bağlanma daha uygun; kullanıcıya sorulacak.
- **Kostümler ve mağaza:** Fun Run'daki gibi şapkalar ve altın.
- **Yeni eşyalar:** Mıknatıs, yumruk, roket (Fun Run 3'te var).
- **Menü:** Arka planı canlı harita olsun.

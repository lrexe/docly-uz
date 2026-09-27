-- =============================================================================
-- supabase/seed.sql
-- Starter set of 3 document templates for Docly.uz (MVP smoke-testing data).
-- Assumes a `document_templates` table shaped roughly like:
--
--   id                uuid primary key default gen_random_uuid()
--   category           text        -- 'rent' | 'business' | 'claims'
--   slug               text unique
--   title_ru           text
--   title_uz           text
--   description_ru     text
--   description_uz     text
--   icon               text
--   price_tiyin        integer     -- 0 = free
--   form_schema        jsonb       -- array of wizard field definitions
--   base_template_ru   text        -- markdown skeleton with {{field_id}} placeholders
--   base_template_uz   text
--   is_active          boolean default true
--   sort_order         integer default 0
--   created_at         timestamptz default now()
--
-- Safe to re-run: uses fixed UUIDs + ON CONFLICT DO NOTHING.
-- =============================================================================

-- 1. Договор аренды жилья / Turar-joy ijara shartnomasi -----------------------
insert into document_templates (
  id, category, slug, title_ru, title_uz, description_ru, description_uz, icon,
  price_tiyin, form_schema, base_template_ru, base_template_uz, is_active, sort_order
) values (
  '11111111-1111-1111-1111-111111111111',
  'rent',
  'rental-agreement-apartment',
  'Договор аренды жилья',
  'Turar-joyni ijaraga berish shartnomasi',
  'Стандартный договор найма квартиры или дома между физическими лицами',
  'Jismoniy shaxslar o''rtasida kvartira yoki uy ijarasi uchun standart shartnoma',
  '🏠',
  500000, -- 5 000 сум
  '[
    {"id":"landlord_name","type":"text","label_ru":"ФИО арендодателя","label_uz":"Ijaraga beruvchi F.I.Sh.","required":true,"placeholder":"Иванов Иван Иванович"},
    {"id":"landlord_passport","type":"text","label_ru":"Паспортные данные арендодателя","label_uz":"Ijaraga beruvchining pasport ma''lumotlari","required":true,"placeholder":"AB1234567, выдан МВД г. Ташкента"},
    {"id":"tenant_name","type":"text","label_ru":"ФИО арендатора","label_uz":"Ijarachi F.I.Sh.","required":true,"placeholder":"Петров Пётр Петрович"},
    {"id":"tenant_passport","type":"text","label_ru":"Паспортные данные арендатора","label_uz":"Ijarachining pasport ma''lumotlari","required":true,"placeholder":"AC7654321, выдан МВД г. Ташкента"},
    {"id":"property_address","type":"text","label_ru":"Адрес объекта","label_uz":"Obyekt manzili","required":true,"placeholder":"г. Ташкент, Юнусабадский р-н, ул. Амира Темура, д. 12, кв. 45"},
    {"id":"property_area","type":"number","label_ru":"Площадь, м²","label_uz":"Maydoni, m²","required":true,"placeholder":"54"},
    {"id":"monthly_rent","type":"number","label_ru":"Ежемесячная арендная плата, сум","label_uz":"Oylik ijara haqi, so''m","required":true,"placeholder":"3000000"},
    {"id":"deposit_amount","type":"number","label_ru":"Сумма залога, сум","label_uz":"Garov summasi, so''m","required":false,"placeholder":"3000000"},
    {"id":"lease_start_date","type":"date","label_ru":"Дата начала аренды","label_uz":"Ijara boshlanish sanasi","required":true},
    {"id":"lease_term_months","type":"number","label_ru":"Срок аренды, месяцев","label_uz":"Ijara muddati, oy","required":true,"placeholder":"12"},
    {"id":"payment_day","type":"number","label_ru":"День оплаты (число месяца)","label_uz":"To''lov kuni (oyning sanasi)","required":true,"placeholder":"5"},
    {"id":"utilities_included","type":"select","label_ru":"Коммунальные услуги","label_uz":"Kommunal xizmatlar","required":true,"options":["Включены в стоимость","Оплачиваются отдельно арендатором"]}
  ]'::jsonb,
  E'# ДОГОВОР АРЕНДЫ ЖИЛОГО ПОМЕЩЕНИЯ\n\nг. Ташкент\t\t\t\t\t\t«___» __________ 20__ г.\n\n**{{landlord_name}}**, паспорт {{landlord_passport}}, именуемый в дальнейшем «Арендодатель», с одной стороны, и **{{tenant_name}}**, паспорт {{tenant_passport}}, именуемый в дальнейшем «Арендатор», с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:\n\n## 1. Предмет договора\n1.1. Арендодатель предоставляет, а Арендатор принимает во временное владение и пользование (аренду) жилое помещение, расположенное по адресу: {{property_address}}, общей площадью {{property_area}} м² (далее — «Объект»).\n1.2. Объект принадлежит Арендодателю на праве собственности.\n\n## 2. Срок действия договора\n2.1. Срок аренды устанавливается с {{lease_start_date}} на {{lease_term_months}} месяцев.\n\n## 3. Арендная плата и порядок расчётов\n3.1. Ежемесячная арендная плата составляет {{monthly_rent}} сум и вносится Арендатором не позднее {{payment_day}} числа каждого месяца.\n3.2. При подписании настоящего Договора Арендатор вносит гарантийный залог в размере {{deposit_amount}} сум.\n3.3. Коммунальные услуги: {{utilities_included}}.\n\n## 4. Права и обязанности Сторон\n4.1. Арендодатель обязуется передать Объект в состоянии, пригодном для проживания.\n4.2. Арендатор обязуется использовать Объект по назначению, поддерживать его в надлежащем состоянии и своевременно вносить арендную плату.\n\n## 5. Ответственность Сторон\n5.1. За неисполнение или ненадлежащее исполнение обязательств по настоящему Договору Стороны несут ответственность в соответствии с законодательством Республики Узбекистан.\n\n## 6. Заключительные положения\n6.1. Настоящий Договор составлен в двух экземплярах, имеющих одинаковую юридическую силу — по одному для каждой из Сторон.\n\n## 7. Реквизиты и подписи сторон\n\n**Арендодатель:** {{landlord_name}}, {{landlord_passport}}\t\t\tПодпись: ______________\n\n**Арендатор:** {{tenant_name}}, {{tenant_passport}}\t\t\tПодпись: ______________',
  E'# TURAR-JOYNI IJARAGA BERISH SHARTNOMASI\n\nToshkent sh.\t\t\t\t\t\t«___» __________ 20__ y.\n\n**{{landlord_name}}**, pasport {{landlord_passport}}, bundan buyon «Ijaraga beruvchi» deb yuritiladi, bir tomondan, va **{{tenant_name}}**, pasport {{tenant_passport}}, bundan buyon «Ijarachi» deb yuritiladi, ikkinchi tomondan, quyidagilar haqida ushbu Shartnomani tuzdilar:\n\n## 1. Shartnoma predmeti\n1.1. Ijaraga beruvchi {{property_address}} manzilida joylashgan, umumiy maydoni {{property_area}} m² bo''lgan turar-joyni (bundan buyon — «Obyekt») Ijarachining vaqtincha egalik qilishi va foydalanishiga topshiradi.\n\n## 2. Shartnoma muddati\n2.1. Ijara muddati {{lease_start_date}} sanasidan boshlab {{lease_term_months}} oy etib belgilanadi.\n\n## 3. Ijara haqi va hisob-kitob tartibi\n3.1. Oylik ijara haqi {{monthly_rent}} so''mni tashkil etadi va har oyning {{payment_day}}-sanasidan kechiktirmay to''lanadi.\n3.2. Shartnoma imzolanganda Ijarachi {{deposit_amount}} so''m miqdorida garov puli to''laydi.\n3.3. Kommunal xizmatlar: {{utilities_included}}.\n\n## 4. Tomonlarning huquq va majburiyatlari\n4.1. Ijaraga beruvchi Obyektni yashash uchun yaroqli holatda topshirishga majburdir.\n4.2. Ijarachi Obyektdan maqsadli foydalanishi va ijara haqini o''z vaqtida to''lashi shart.\n\n## 5. Tomonlarning javobgarligi\n5.1. Ushbu Shartnoma bo''yicha majburiyatlarni bajarmagan yoki lozim darajada bajarmagan Tomonlar O''zbekiston Respublikasi qonunchiligiga muvofiq javobgar bo''ladilar.\n\n## 6. Yakuniy qoidalar\n6.1. Ushbu Shartnoma bir xil yuridik kuchga ega ikki nusxada tuzildi — har bir Tomon uchun bittadan.\n\n## 7. Tomonlarning rekvizitlari va imzolari\n\n**Ijaraga beruvchi:** {{landlord_name}}, {{landlord_passport}}\t\t\tImzo: ______________\n\n**Ijarachi:** {{tenant_name}}, {{tenant_passport}}\t\t\tImzo: ______________',
  true,
  1
) on conflict (id) do nothing;

-- 2. NDA / Maxfiylik to''g''risidagi shartnoma ---------------------------------
insert into document_templates (
  id, category, slug, title_ru, title_uz, description_ru, description_uz, icon,
  price_tiyin, form_schema, base_template_ru, base_template_uz, is_active, sort_order
) values (
  '22222222-2222-2222-2222-222222222222',
  'business',
  'nda-mutual',
  'Соглашение о неразглашении (NDA)',
  'Maxfiylikni saqlash to''g''risidagi shartnoma (NDA)',
  'Двустороннее соглашение о защите конфиденциальной информации между компаниями или ИП',
  'Kompaniyalar yoki YaTT o''rtasida maxfiy ma''lumotlarni himoya qilish bo''yicha ikki tomonlama shartnoma',
  '🔒',
  700000, -- 7 000 сум
  '[
    {"id":"party_a_name","type":"text","label_ru":"Название/ФИО стороны А (раскрывающая сторона)","label_uz":"A tomon nomi/F.I.Sh. (oshkor qiluvchi tomon)","required":true,"placeholder":"ООО \"Docly Tech\""},
    {"id":"party_a_rep","type":"text","label_ru":"Представитель стороны А, должность","label_uz":"A tomon vakili, lavozimi","required":true,"placeholder":"директор Каримов А.А."},
    {"id":"party_b_name","type":"text","label_ru":"Название/ФИО стороны Б (принимающая сторона)","label_uz":"B tomon nomi/F.I.Sh. (qabul qiluvchi tomon)","required":true,"placeholder":"ИП Рахимов Б.Б."},
    {"id":"party_b_rep","type":"text","label_ru":"Представитель стороны Б, должность","label_uz":"B tomon vakili, lavozimi","required":true,"placeholder":"Рахимов Б.Б."},
    {"id":"purpose","type":"textarea","label_ru":"Цель раскрытия информации","label_uz":"Ma''lumot oshkor qilish maqsadi","required":true,"placeholder":"обсуждение потенциального сотрудничества по разработке ПО"},
    {"id":"confidentiality_term_years","type":"number","label_ru":"Срок конфиденциальности, лет","label_uz":"Maxfiylik muddati, yil","required":true,"placeholder":"3"},
    {"id":"governing_city","type":"text","label_ru":"Город заключения договора","label_uz":"Shartnoma tuzilgan shahar","required":true,"placeholder":"Ташкент"},
    {"id":"signing_date","type":"date","label_ru":"Дата подписания","label_uz":"Imzolanish sanasi","required":true}
  ]'::jsonb,
  E'# СОГЛАШЕНИЕ О НЕРАЗГЛАШЕНИИ КОНФИДЕНЦИАЛЬНОЙ ИНФОРМАЦИИ (NDA)\n\nг. {{governing_city}}\t\t\t\t\t\t{{signing_date}}\n\n**{{party_a_name}}**, в лице {{party_a_rep}}, именуемое в дальнейшем «Сторона А», с одной стороны, и **{{party_b_name}}**, в лице {{party_b_rep}}, именуемое в дальнейшем «Сторона Б», с другой стороны, заключили настоящее Соглашение о нижеследующем:\n\n## 1. Предмет соглашения\n1.1. Стороны обязуются сохранять конфиденциальность информации, полученной друг от друга в связи с целью: {{purpose}}.\n\n## 2. Определение конфиденциальной информации\n2.1. Конфиденциальной информацией признаются любые сведения технического, финансового, коммерческого или организационного характера, переданные одной Стороной другой в письменной, устной или электронной форме и обозначенные как конфиденциальные.\n\n## 3. Обязательства Сторон\n3.1. Каждая Сторона обязуется:\n— не разглашать конфиденциальную информацию третьим лицам без письменного согласия другой Стороны;\n— использовать полученную информацию исключительно в целях, указанных в п. 1.1;\n— применять не менее строгие меры защиты информации, чем в отношении собственной конфиденциальной информации.\n\n## 4. Срок действия обязательств\n4.1. Обязательства по конфиденциальности действуют в течение {{confidentiality_term_years}} лет с даты подписания настоящего Соглашения.\n\n## 5. Ответственность\n5.1. За разглашение конфиденциальной информации виновная Сторона возмещает другой Стороне причинённые убытки в соответствии с законодательством Республики Узбекистан.\n\n## 6. Заключительные положения\n6.1. Настоящее Соглашение составлено в двух экземплярах, по одному для каждой из Сторон.\n\n## 7. Подписи Сторон\n\n**Сторона А:** {{party_a_name}} / {{party_a_rep}}\t\t\tПодпись: ______________\n\n**Сторона Б:** {{party_b_name}} / {{party_b_rep}}\t\t\tПодпись: ______________',
  E'# MAXFIYLIKNI SAQLASH TO''G''RISIDAGI SHARTNOMA (NDA)\n\n{{governing_city}} sh.\t\t\t\t\t\t{{signing_date}}\n\n**{{party_a_name}}**, {{party_a_rep}} nomidan, bundan buyon «A tomon» deb yuritiladi, bir tomondan, va **{{party_b_name}}**, {{party_b_rep}} nomidan, bundan buyon «B tomon» deb yuritiladi, ikkinchi tomondan, quyidagilar haqida ushbu Shartnomani tuzdilar:\n\n## 1. Shartnoma predmeti\n1.1. Tomonlar quyidagi maqsad bilan bog''liq holda bir-biridan olingan ma''lumotlar maxfiyligini saqlashga majburdirlar: {{purpose}}.\n\n## 2. Maxfiy ma''lumot tushunchasi\n2.1. Bir Tomon tomonidan ikkinchisiga yozma, og''zaki yoki elektron shaklda uzatilgan va maxfiy deb belgilangan texnik, moliyaviy, tijorat yoki tashkiliy xarakterdagi har qanday ma''lumot maxfiy ma''lumot deb hisoblanadi.\n\n## 3. Tomonlarning majburiyatlari\n3.1. Har bir Tomon quyidagilarga majburdir:\n— boshqa Tomonning yozma roziligisiz maxfiy ma''lumotni uchinchi shaxslarga oshkor qilmaslik;\n— olingan ma''lumotdan faqat 1.1-bandda ko''rsatilgan maqsadlarda foydalanish;\n— o''z maxfiy ma''lumotiga nisbatan qo''llaniladigan darajadan kam bo''lmagan himoya choralarini qo''llash.\n\n## 4. Majburiyatlar muddati\n4.1. Maxfiylik majburiyatlari ushbu Shartnoma imzolangan kundan boshlab {{confidentiality_term_years}} yil davomida amal qiladi.\n\n## 5. Javobgarlik\n5.1. Maxfiy ma''lumotni oshkor qilgan aybdor Tomon O''zbekiston Respublikasi qonunchiligiga muvofiq boshqa Tomonga yetkazilgan zararni qoplaydi.\n\n## 6. Yakuniy qoidalar\n6.1. Ushbu Shartnoma har bir Tomon uchun bittadan bo''lgan holda ikki nusxada tuzildi.\n\n## 7. Tomonlarning imzolari\n\n**A tomon:** {{party_a_name}} / {{party_a_rep}}\t\t\tImzo: ______________\n\n**B tomon:** {{party_b_name}} / {{party_b_rep}}\t\t\tImzo: ______________',
  true,
  1
) on conflict (id) do nothing;

-- 3. Претензия о возврате долга / Qarzni qaytarish to''g''risida da'vo --------
insert into document_templates (
  id, category, slug, title_ru, title_uz, description_ru, description_uz, icon,
  price_tiyin, form_schema, base_template_ru, base_template_uz, is_active, sort_order
) values (
  '33333333-3333-3333-3333-333333333333',
  'claims',
  'debt-claim-letter',
  'Претензия о возврате долга',
  'Qarzni qaytarish to''g''risida da''vo',
  'Досудебная претензия к должнику с требованием вернуть денежные средства',
  'Qarzdorga pul mablag''larini qaytarish talabi bilan yuboriladigan sud oldi da''vosi',
  '⚖️',
  300000, -- 3 000 сум
  '[
    {"id":"creditor_name","type":"text","label_ru":"ФИО/название кредитора","label_uz":"Kreditor F.I.Sh./nomi","required":true,"placeholder":"Иванов Иван Иванович"},
    {"id":"creditor_address","type":"text","label_ru":"Адрес кредитора","label_uz":"Kreditor manzili","required":true,"placeholder":"г. Ташкент, ул. Мустакиллик, 10"},
    {"id":"debtor_name","type":"text","label_ru":"ФИО/название должника","label_uz":"Qarzdor F.I.Sh./nomi","required":true,"placeholder":"Сидоров Сидор Сидорович"},
    {"id":"debtor_address","type":"text","label_ru":"Адрес должника","label_uz":"Qarzdor manzili","required":true,"placeholder":"г. Ташкент, ул. Навои, 25"},
    {"id":"debt_basis","type":"textarea","label_ru":"Основание возникновения долга","label_uz":"Qarz yuzaga kelish asosi","required":true,"placeholder":"договор займа №12 от 01.02.2026, расписка от 01.02.2026"},
    {"id":"debt_amount","type":"number","label_ru":"Сумма долга, сум","label_uz":"Qarz summasi, so''m","required":true,"placeholder":"15000000"},
    {"id":"due_date","type":"date","label_ru":"Дата, до которой долг должен был быть возвращён","label_uz":"Qarz qaytarilishi kerak bo''lgan sana","required":true},
    {"id":"response_deadline_days","type":"number","label_ru":"Срок для добровольного погашения, дней","label_uz":"Ixtiyoriy to''lash uchun muddat, kun","required":true,"placeholder":"10"},
    {"id":"claim_date","type":"date","label_ru":"Дата составления претензии","label_uz":"Da''vo tuzilgan sana","required":true}
  ]'::jsonb,
  E'# ПРЕТЕНЗИЯ\nо возврате суммы долга\n\nОт: {{creditor_name}}, адрес: {{creditor_address}}\nКому: {{debtor_name}}, адрес: {{debtor_address}}\n\n{{claim_date}}\n\nУважаемый(ая) {{debtor_name}},\n\nМежду мной, {{creditor_name}}, и Вами возникли долговые обязательства на основании: {{debt_basis}}.\n\nСогласно указанному основанию, сумма Вашей задолженности передо мной составляет **{{debt_amount}} сум**. Срок возврата долга истёк {{due_date}}, однако до настоящего момента денежные средства мне не возвращены.\n\n## Требование\nНа основании изложенного и руководствуясь нормами Гражданского кодекса Республики Узбекистан об обязательствах, **требую** в течение {{response_deadline_days}} календарных дней с даты получения настоящей претензии погасить задолженность в размере {{debt_amount}} сум в полном объёме.\n\n## Предупреждение\nВ случае неисполнения настоящего требования в указанный срок я буду вынужден(а) обратиться в суд с исковым заявлением о взыскании суммы долга, а также процентов за пользование чужими денежными средствами и судебных расходов, включая государственную пошлину.\n\nПрошу рассматривать настоящую претензию как попытку досудебного урегулирования спора.\n\n{{creditor_name}}\t\t\t\t\t\tПодпись: ______________\n{{claim_date}}',
  E'# DA''VO\nqarz summasini qaytarish to''g''risida\n\nKimdan: {{creditor_name}}, manzil: {{creditor_address}}\nKimga: {{debtor_name}}, manzil: {{debtor_address}}\n\n{{claim_date}}\n\nHurmatli {{debtor_name}},\n\nMen, {{creditor_name}}, va Siz o''rtasida quyidagi asosda qarz majburiyati yuzaga kelgan: {{debt_basis}}.\n\nUshbu asosga ko''ra, sizning mening oldimdagi qarzingiz summasi **{{debt_amount}} so''mni** tashkil etadi. Qarzni qaytarish muddati {{due_date}} sanasida tugagan, biroq hozirgi kungacha mablag'' menga qaytarilmagan.\n\n## Talab\nYuqorida bayon etilganlar asosida hamda O''zbekiston Respublikasi Fuqarolik kodeksining majburiyatlar to''g''risidagi normalariga tayangan holda, ushbu da''voni olgan kundan boshlab {{response_deadline_days}} kalendar kuni ichida {{debt_amount}} so''m miqdoridagi qarzni to''liq qaytarishingizni **talab qilaman**.\n\n## Ogohlantirish\nUshbu talab ko''rsatilgan muddatda bajarilmagan taqdirda, men qarz summasini, shuningdek boshqa birovning pul mablag''laridan foydalanganlik uchun foizlarni va davlat bojini o''z ichiga olgan sud xarajatlarini undirish to''g''risida sudga da''vo arizasi bilan murojaat qilishga majbur bo''laman.\n\nUshbu da''voni nizoni sudgacha hal etishga urinish sifatida ko''rib chiqishingizni so''rayman.\n\n{{creditor_name}}\t\t\t\t\t\tImzo: ______________\n{{claim_date}}',
  true,
  1
) on conflict (id) do nothing;
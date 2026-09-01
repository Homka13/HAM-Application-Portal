import React, { useState, useMemo } from 'react';

interface NomenclatureFormProps {
  serviceId: string;
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

export const NomenclatureForm: React.FC<NomenclatureFormProps> = ({
  serviceId,
  onSuccess,
  onCancel,
}) => {
  const [applicantName, setApplicantName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [department, setDepartment] = useState('');

  // Nomenclature specific fields
  const [fullName, setFullName] = useState('');
  const [shortName, setShortName] = useState('');
  const [itemType, setItemType] = useState('Матеріали');
  const [unit, setUnit] = useState('шт');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [vatRate, setVatRate] = useState('20%');
  const [uktzed, setUktzed] = useState('');
  const [supplier, setSupplier] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [monthlyRequirement, setMonthlyRequirement] = useState('');
  const [specLink, setSpecLink] = useState('');
  const [description, setDescription] = useState('');

  // Prioritization
  const [bv, setBv] = useState(3);
  const [risk, setRisk] = useState(3);
  const [tc, setTc] = useState(3);
  const [dueDate, setDueDate] = useState('');

  const calculatedWsjf = useMemo(() => {
    return Number((((bv + risk + tc) / 3) * 2).toFixed(1));
  }, [bv, risk, tc]);

  const priority = useMemo(() => {
    if (tc >= 4 || bv >= 5) return 'HIGH';
    if (tc >= 3 || bv >= 3) return 'MEDIUM';
    return 'LOW';
  }, [bv, tc]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      nomenclature: {
        fullName,
        shortName: shortName || fullName,
        itemType,
        unit,
        sku,
        barcode,
        vatRate,
        uktzed,
        supplier,
        warehouse,
        monthlyRequirement,
        specLink,
      },
    };

    const formattedDescription = `Створення нової номенклатури: «${fullName}» (${itemType}, од.вим: ${unit}). Постачальник: ${supplier || '—'}, Склад: ${warehouse || '—'}. ${description ? `Коментар: ${description}` : ''}`;

    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantName,
          type: 'SERVICE_REQUEST',
          priority,
          description: formattedDescription,
          serviceCatalogId: serviceId,
          formType: 'A',
          subtype: 'Номенклатура',
          payload,
          requesterEmail: requesterEmail || undefined,
          bv,
          r: risk,
          tc,
          wsjf: calculatedWsjf,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Помилка створення заявки: ${err.error || 'Перевірте поля'}`);
        return;
      }

      const created = await res.json();
      onSuccess(`Заявку на номенклатуру #${created.id.slice(0, 8)} успішно створено!`);
    } catch (err: any) {
      alert(`Помилка підключення до сервера: ${err.message}`);
    }
  };

  return (
    <section className="bg-white border border-[#EDE5DD] rounded-2xl p-6 sm:p-7 shadow-[0_2px_12px_rgba(62,36,23,0.03)] space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-[#F2EBE4] flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E8663B]" />
          <div>
            <h2 className="text-base font-bold text-[#1E1712]">
              Створення заявки на нову номенклатуру (ERP / Склад)
            </h2>
            <div className="text-[11px] text-[#8B7D72] font-mono">
              Спеціалізована форма введення матеріальних цінностей та послуг
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-[#5A4E45] hover:text-[#1E1712] bg-[#F5EFE9] hover:bg-[#EDE5DD] px-3 py-1.5 rounded-xl transition-colors"
        >
          Змінити сервіс / Загальна форма
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Applicant Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#5A4E45]">
              Ім'я заявника <span className="text-[#C22B22]">*</span>
            </label>
            <input
              type="text"
              required
              value={applicantName}
              onChange={(e) => setApplicantName(e.target.value)}
              placeholder="ПІБ співробітника"
              className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#5A4E45]">Email заявника</label>
            <input
              type="email"
              value={requesterEmail}
              onChange={(e) => setRequesterEmail(e.target.value)}
              placeholder="user@company.local"
              className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#5A4E45]">Підрозділ / Відділ</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="напр. Виробництво / Склад"
              className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
            />
          </div>
        </div>

        {/* 2. Main Nomenclature Details */}
        <div className="pt-2 border-t border-[#F2EBE4] space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[#5A4E45] font-mono">
            Основні атрибути номенклатури
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">
                Повна назва номенклатури <span className="text-[#C22B22]">*</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="напр. Кабель силовий мідний ВВГнг 3х2.5 мм²"
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">
                Скорочена назва (для накладних)
              </label>
              <input
                type="text"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="напр. ВВГнг 3х2.5"
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">
                Вид номенклатури <span className="text-[#C22B22]">*</span>
              </label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B]"
              >
                <option value="Матеріали">Матеріали</option>
                <option value="Сировина">Сировина</option>
                <option value="Товар">Товар</option>
                <option value="Готова продукція">Готова продукція</option>
                <option value="Напівфабрикат">Напівфабрикат</option>
                <option value="Запасні частини (ЗІП)">Запасні частини (ЗІП)</option>
                <option value="Послуга">Послуга</option>
                <option value="Основні засоби (ОЗ)">Основні засоби (ОЗ)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">
                Одиниця виміру <span className="text-[#C22B22]">*</span>
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B]"
              >
                <option value="шт">Штуки (шт)</option>
                <option value="кг">Кілограми (кг)</option>
                <option value="т">Тонни (т)</option>
                <option value="л">Літри (л)</option>
                <option value="м">Метри (м)</option>
                <option value="м²">Метри квадратні (м²)</option>
                <option value="м³">Метри кубічні (м³)</option>
                <option value="компл">Комплект (компл)</option>
                <option value="упак">Упаковка (упак)</option>
                <option value="палета">Палета</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">Артикул / Каталожний №</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="напр. VVG-3X2.5-NG"
                className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">Штрихкод (EAN / UPC)</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="4820000000000"
                className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">Ставка ПДВ</label>
              <select
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none"
              >
                <option value="20%">20% (Основна)</option>
                <option value="7%">7% (Фарм/Мед)</option>
                <option value="0%">0% (Експорт)</option>
                <option value="Без ПДВ">Без ПДВ</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">Код УКТЗЕД</label>
              <input
                type="text"
                value={uktzed}
                onChange={(e) => setUktzed(e.target.value)}
                placeholder="8544 49 91 00"
                className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
              />
            </div>
          </div>
        </div>

        {/* 3. Logistics and Supplier */}
        <div className="pt-2 border-t border-[#F2EBE4] space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[#5A4E45] font-mono">
            Постачання та складське зберігання
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">Основний постачальник / Виробник</label>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="ТОВ / Завод-виробник"
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">Склад призначення / Цех</label>
              <input
                type="text"
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                placeholder="Головний склад / Цех №1"
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#5A4E45]">Орієнтовна потреба на місяць</label>
              <input
                type="text"
                value={monthlyRequirement}
                onChange={(e) => setMonthlyRequirement(e.target.value)}
                placeholder="напр. 500 шт"
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#5A4E45]">
              Посилання на технічну специфікацію / паспорт (URL)
            </label>
            <input
              type="url"
              value={specLink}
              onChange={(e) => setSpecLink(e.target.value)}
              placeholder="https://docs.company.local/specs/item-datasheet.pdf"
              className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#5A4E45]">
              Додатковий коментар / Призначення номенклатури
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Вкажіть особливості обліку, умови зберігання або для якого проекту використовується..."
              className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl p-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] resize-none"
            />
          </div>
        </div>

        {/* 4. Prioritization & WSJF */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-[#F2EBE4]">
          <div className="bg-[#FBF8F5] border border-[#EDE5DD] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5A4E45] font-mono">
                Оцінка цінності (WSJF)
              </span>
              <span className="font-mono text-sm font-bold text-[#E8663B] bg-[#FDEDE5] px-2.5 py-0.5 rounded-lg border border-[#F9CDB4]">
                WSJF {calculatedWsjf}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-[#5A4E45]">
                <span>Business Value (Важливість для виробництва)</span>
                <span className="font-mono text-[#C7522F] font-bold">{bv}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={bv}
                onChange={(e) => setBv(+e.target.value)}
                className="w-full accent-[#E8663B]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-[#5A4E45]">
                <span>Risk Reduction (Ризик простою)</span>
                <span className="font-mono text-[#C7522F] font-bold">{risk}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={risk}
                onChange={(e) => setRisk(+e.target.value)}
                className="w-full accent-[#E8663B]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-[#5A4E45]">
                <span>Time Criticality (Терміновість введення)</span>
                <span className="font-mono text-[#C7522F] font-bold">{tc}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={tc}
                onChange={(e) => setTc(+e.target.value)}
                className="w-full accent-[#E8663B]"
              />
            </div>
          </div>

          <div className="bg-[#FBF8F5] border border-[#EDE5DD] rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[#5A4E45] font-mono">
                Термін створення в системі
              </div>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B]"
              />
              <div className="text-[11px] text-[#8B7D72]">
                Орієнтовний термін заведення картки номенклатури в ERP/1C.
              </div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-[#EDE5DD]">
              <div className="text-xs text-[#5A4E45]">
                Після подачі заявка пройде стандартний ITSM життєвий цикл (Тріаж ➔ Заведення в 1C/ERP ➔ Підтвердження).
              </div>
            </div>
          </div>
        </div>

        {/* 5. Submit Action */}
        <div className="flex gap-3 items-center pt-2">
          <button
            type="submit"
            className="text-sm font-semibold text-white bg-[#E8663B] hover:bg-[#C7522F] border border-[#E8663B] rounded-xl px-6 h-10 shadow-sm transition-colors cursor-pointer"
          >
            Подати заявку на номенклатуру
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-semibold text-[#5A4E45] hover:bg-[#F5EFE9] hover:text-[#1E1712] rounded-xl px-4 h-10 transition-colors"
          >
            Скасувати
          </button>
        </div>
      </form>
    </section>
  );
};

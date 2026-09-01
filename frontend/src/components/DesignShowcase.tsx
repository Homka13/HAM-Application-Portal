import React, { useState, useId } from 'react';

export const DesignShowcase = () => {
  const [mascotVisible] = useState(true);
  const [showHexCodes] = useState(true);
  const [bv, setBv] = useState(4);
  const [risk, setRisk] = useState(3);
  const [tc, setTc] = useState(4);
  const [impact, setImpact] = useState('high');
  const [urgency, setUrgency] = useState('high');
  const [modalOpen, setModalOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);

  // Accessible IDs for form controls
  const requestNameId = useId();
  const reportUrlId = useId();
  const dueDateId = useId();
  const serviceSelectId = useId();
  const descTextareaId = useId();
  const bvRangeId = useId();
  const riskRangeId = useId();
  const tcRangeId = useId();
  const modalTextareaId = useId();

  const wsjf = (((bv + risk + tc) / 3) * 2).toFixed(1);

  const getPriorityFromMatrix = (i: string, u: string) => {
    const matrix: Record<string, string> = {
      'high-high': 'P1',
      'high-mid': 'P2',
      'high-low': 'P3',
      'mid-high': 'P2',
      'mid-mid': 'P3',
      'mid-low': 'P3',
      'low-high': 'P3',
      'low-mid': 'P4',
      'low-low': 'P4',
    };
    return matrix[`${i}-${u}`] || 'P4';
  };

  const tones: Record<string, [string, string, string]> = {
    P1: ['#FBE8E6', '#8E1F19', '#F3CFCB'],
    P2: ['#FDF1DC', '#92580A', '#F3DFB8'],
    P3: ['#E4F1F3', '#235C68', '#C7E1E5'],
    P4: ['#F1ECE7', '#6A5D53', '#E1D8D0'],
  };

  const impacts = [
    ['high', 'Високий'],
    ['mid', 'Середній'],
    ['low', 'Низький'],
  ];
  const urgencies = ['high', 'mid', 'low'];
  const priorityLabels: Record<string, string> = {
    P1: 'Критичний',
    P2: 'Високий',
    P3: 'Середній',
    P4: 'Низький',
  };

  const getUrgencyLabel = (u: string) => {
    if (u === 'high') return 'Висока';
    if (u === 'mid') return 'Середня';
    return 'Низька';
  };

  const stepDefs = [
    ['Новий', 1],
    ['Підготовка ТЗ', 1],
    ['Погодження', 1],
    ['Погоджено', 1],
    ['Тріаж', 1],
    ['Оцінка', 1],
    ['В роботі', 2],
    ['Тестування', 0],
    ['UAT', 0],
    ['Вирішено', 0],
    ['Закрито', 0],
  ];

  const getStepCircleClass = (st: number) => {
    if (st === 2) return 'bg-white border-2 border-[#E8663B] ring-4 ring-[#FDEDE5]';
    if (st === 1) return 'bg-[#E8663B]';
    return 'bg-white border-2 border-[#DED4CA]';
  };

  const getStepTextClass = (st: number) => {
    if (st === 2) return 'font-bold text-[#1E1712]';
    if (st === 1) return 'text-[#5A4E45]';
    return 'text-[#8B7D72]';
  };

  const getStepLeftLineBg = (index: number, st: number) => {
    if (index === 0) return 'bg-transparent';
    if (st !== 0) return 'bg-[#F9CDB4]';
    return 'bg-[#EDE5DD]';
  };

  const getStepRightLineBg = (isLast: boolean, st: number) => {
    if (isLast) return 'bg-transparent';
    if (st === 1) return 'bg-[#F9CDB4]';
    return 'bg-[#EDE5DD]';
  };

  const fireToast = () => {
    setToastOpen(true);
    setTimeout(() => setToastOpen(false), 4000);
  };

  const currentPriority = getPriorityFromMatrix(impact, urgency);

  return (
    <div className="space-y-10">
      {/* HERO SECTION */}
      <div className="flex gap-8 items-center py-6 flex-wrap">
        <div className="flex-1 min-w-[320px] flex flex-col gap-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1E1712] leading-tight">
            Токени й компоненти<br />внутрішнього порталу
          </h1>
          <p className="text-sm sm:text-base text-[#5A4E45] leading-relaxed max-w-2xl">
            Тепла палітра носухи, компактна щільність робочого інструменту, семантика пріоритетів P1–P4 і дванадцяти статусів заявки.
          </p>
        </div>
        {mascotVisible && (
          <div className="flex-shrink-0 flex justify-center">
            <div className="w-52 p-4 rounded-2xl bg-white border border-[#EDE5DD] shadow-[0_10px_26px_rgba(62,36,23,0.05)] flex flex-col items-center gap-3">
              <img
                src="/mascot-preview.png"
                alt="Маскот носуха"
                className="w-28 h-28 rounded-2xl object-cover"
              />
              <div className="text-xs text-[#8B7D72] text-center leading-snug">
                Маскот робочого простору
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 01 · ПАЛІТРА */}
      <section className="pt-8 border-t border-[#EDE5DD]">
        <div className="font-mono text-xs uppercase tracking-widest text-[#8B7D72] mb-1">
          01 · Палітра
        </div>
        <h2 className="text-xl font-bold text-[#1E1712] mb-5">Кольори</h2>

        <div className="text-xs font-semibold text-[#5A4E45] mb-2.5">
          Акцент — тепла руда носухи
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-6">
          {[
            { name: 'accent-50', hex: '#FDEDE5', border: true },
            { name: 'accent-200', hex: '#F9CDB4', border: true },
            { name: 'accent-400', hex: '#F6A54A' },
            { name: 'accent-600 · осн.', hex: '#E8663B' },
            { name: 'accent-700 · hover', hex: '#C7522F' },
            { name: 'fur-700 · хутро', hex: '#6B4126' },
            { name: 'mask-900 · маска', hex: '#3E2417' },
          ].map((c) => (
            <div key={c.name} className="flex flex-col gap-1.5">
              <div
                className={`h-14 rounded-xl ${c.border ? 'border border-[#3E2417]/10' : ''}`}
                style={{ backgroundColor: c.hex }}
              />
              <div className="text-xs font-semibold text-[#1E1712] truncate">{c.name}</div>
              {showHexCodes && (
                <div className="text-[11px] font-mono text-[#8B7D72]">{c.hex}</div>
              )}
            </div>
          ))}
        </div>

        <div className="text-xs font-semibold text-[#5A4E45] mb-2.5">
          Нейтральні — теплий сірий
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-6">
          {[
            { name: 'surface', hex: '#FFFFFF', border: true },
            { name: 'bg', hex: '#FBF8F5', border: true },
            { name: 'surface-2', hex: '#F5EFE9', border: true },
            { name: 'line', hex: '#EDE5DD' },
            { name: 'ink-400', hex: '#8B7D72' },
            { name: 'ink-600', hex: '#5A4E45' },
            { name: 'ink-900', hex: '#1E1712' },
          ].map((c) => (
            <div key={c.name} className="flex flex-col gap-1.5">
              <div
                className={`h-14 rounded-xl ${c.border ? 'border border-[#3E2417]/10' : ''}`}
                style={{ backgroundColor: c.hex }}
              />
              <div className="text-xs font-semibold text-[#1E1712] truncate">{c.name}</div>
              {showHexCodes && (
                <div className="text-[11px] font-mono text-[#8B7D72]">{c.hex}</div>
              )}
            </div>
          ))}
        </div>

        <div className="text-xs font-semibold text-[#5A4E45] mb-2.5">
          Семантика пріоритету (P1–P4)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'P1 · Критичний', hex: '#C22B22', textColor: '#FBE8E6' },
            { label: 'P2 · Високий', hex: '#D97706', textColor: '#FDF1DC' },
            { label: 'P3 · Середній', hex: '#2F7D8C', textColor: '#E4F1F3' },
            { label: 'P4 · Низький', hex: '#8B7D72', textColor: '#F1ECE7' },
          ].map((p) => (
            <div key={p.label} className="flex flex-col gap-1.5">
              <div
                className="h-14 rounded-xl flex items-end p-2 font-mono text-[11px]"
                style={{ backgroundColor: p.hex, color: p.textColor }}
              >
                {p.hex}
              </div>
              <div className="text-xs font-semibold text-[#1E1712]">{p.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 02 · ТИПОГРАФІКА */}
      <section className="pt-8 border-t border-[#EDE5DD]">
        <div className="font-mono text-xs uppercase tracking-widest text-[#8B7D72] mb-1">
          02 · Типографіка
        </div>
        <h2 className="text-xl font-bold text-[#1E1712] mb-5">Manrope · JetBrains Mono</h2>
        <div className="bg-white border border-[#EDE5DD] rounded-2xl overflow-hidden divide-y divide-[#F2EBE4]">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-baseline p-4 sm:px-5">
            <div className="w-36 font-mono text-xs text-[#8B7D72]">display / 40 / 700</div>
            <div className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1E1712]">Заявка №1042</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-baseline p-4 sm:px-5">
            <div className="w-36 font-mono text-xs text-[#8B7D72]">h1 / 26 / 700</div>
            <div className="text-2xl font-bold tracking-tight text-[#1E1712]">Черга запитів команди</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-baseline p-4 sm:px-5">
            <div className="w-36 font-mono text-xs text-[#8B7D72]">h2 / 18 / 600</div>
            <div className="text-lg font-semibold text-[#1E1712]">Оцінка цінності запиту</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-baseline p-4 sm:px-5">
            <div className="w-36 font-mono text-xs text-[#8B7D72]">body / 14 / 400</div>
            <div className="text-sm text-[#1E1712] leading-relaxed max-w-xl">
              Опишіть, який звіт потрібно доробити та які саме зміни очікуєте.
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-baseline p-4 sm:px-5">
            <div className="w-36 font-mono text-xs text-[#8B7D72]">mono / 12 / 500</div>
            <div className="text-xs font-mono font-medium text-[#5A4E45]">HAM-1042 · WSJF 8.4 · SLA 04:12</div>
          </div>
        </div>
      </section>

      {/* 03 · ДІЇ ТА КНОПКИ */}
      <section className="pt-8 border-t border-[#EDE5DD]">
        <div className="font-mono text-xs uppercase tracking-widest text-[#8B7D72] mb-1">
          03 · Дії
        </div>
        <h2 className="text-xl font-bold text-[#1E1712] mb-5">Кнопки</h2>
        <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              className="text-xs sm:text-sm font-semibold text-white bg-[#E8663B] hover:bg-[#C7522F] border border-[#E8663B] rounded-xl px-4 h-9 shadow-sm transition-colors cursor-pointer"
            >
              Подати запит
            </button>
            <button
              type="button"
              className="text-xs sm:text-sm font-semibold text-[#1E1712] bg-white hover:bg-[#F5EFE9] border border-[#DED4CA] rounded-xl px-4 h-9 transition-colors cursor-pointer"
            >
              Зберегти чернетку
            </button>
            <button
              type="button"
              className="text-xs sm:text-sm font-semibold text-[#5A4E45] hover:bg-[#F5EFE9] hover:text-[#1E1712] rounded-xl px-3 h-9 transition-colors cursor-pointer"
            >
              Скасувати
            </button>
            <button
              type="button"
              className="text-xs sm:text-sm font-semibold text-white bg-[#C22B22] hover:bg-[#A31F18] border border-[#C22B22] rounded-xl px-4 h-9 transition-colors cursor-pointer"
            >
              Відхилити
            </button>
            <button
              type="button"
              disabled
              className="text-xs sm:text-sm font-semibold text-[#B5A9A0] bg-[#F5EFE9] border border-[#EDE5DD] rounded-xl px-4 h-9 cursor-not-allowed"
            >
              Недоступно
            </button>
          </div>
        </div>
      </section>

      {/* 04 · ВВЕДЕННЯ ТА WSJF */}
      <section className="pt-8 border-t border-[#EDE5DD]">
        <div className="font-mono text-xs uppercase tracking-widest text-[#8B7D72] mb-1">
          04 · Введення
        </div>
        <h2 className="text-xl font-bold text-[#1E1712] mb-5">Поля форми та інтерактивні слайдери</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={requestNameId} className="text-xs font-semibold text-[#5A4E45]">
                Назва запиту
              </label>
              <input
                id={requestNameId}
                type="text"
                placeholder="Коротко, одним рядком"
                className="text-xs text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-9 px-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={reportUrlId} className="text-xs font-semibold text-[#5A4E45]">
                Посилання на звіт
              </label>
              <input
                id={reportUrlId}
                type="text"
                defaultValue="https://bi.internal/reports/sales-daily"
                className="font-mono text-xs text-[#1E1712] bg-white border border-[#E8663B] rounded-xl h-9 px-3 outline-none ring-2 ring-[#FDEDE5]"
              />
              <div className="text-[11px] text-[#8B7D72]">Обов'язкове при підтипі «Доробка»</div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={dueDateId} className="text-xs font-semibold text-[#5A4E45]">
                Кінцевий термін
              </label>
              <input
                id={dueDateId}
                type="text"
                placeholder="дд.мм.рррр"
                className="text-xs text-[#1E1712] bg-white border border-[#C22B22] rounded-xl h-9 px-3 outline-none"
              />
              <div className="text-[11px] text-[#C22B22] font-medium">Обов'язковий при Time Criticality ≥ 4</div>
            </div>
          </div>

          <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={serviceSelectId} className="text-xs font-semibold text-[#5A4E45]">
                Сервіс
              </label>
              <select
                id={serviceSelectId}
                className="text-xs text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-9 px-2.5 outline-none focus:border-[#E8663B]"
              >
                <option>Створення звіт павер бі</option>
                <option>Отримання доступу до павер бі</option>
                <option>Створення заявки на номенклатуру</option>
                <option>Зупинка виробництва</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={descTextareaId} className="text-xs font-semibold text-[#5A4E45]">
                Опис
              </label>
              <textarea
                id={descTextareaId}
                rows={3}
                placeholder="Що саме зламалось або що потрібно зробити"
                className="text-xs text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl p-2.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] resize-none"
              />
            </div>
          </div>

          <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 space-y-4">
            <div className="text-xs font-semibold text-[#5A4E45]">Оцінка цінності · 1–5</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor={bvRangeId}>Business Value</label>
                <span className="font-mono text-[#C7522F] font-semibold">{bv}</span>
              </div>
              <input
                id={bvRangeId}
                type="range"
                min="1"
                max="5"
                value={bv}
                onChange={(e) => setBv(+e.target.value)}
                className="w-full accent-[#E8663B]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor={riskRangeId}>Risk / Opportunity</label>
                <span className="font-mono text-[#C7522F] font-semibold">{risk}</span>
              </div>
              <input
                id={riskRangeId}
                type="range"
                min="1"
                max="5"
                value={risk}
                onChange={(e) => setRisk(+e.target.value)}
                className="w-full accent-[#E8663B]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor={tcRangeId}>Time Criticality</label>
                <span className="font-mono text-[#C7522F] font-semibold">{tc}</span>
              </div>
              <input
                id={tcRangeId}
                type="range"
                min="1"
                max="5"
                value={tc}
                onChange={(e) => setTc(+e.target.value)}
                className="w-full accent-[#E8663B]"
              />
            </div>
            <div className="flex items-center justify-between p-2.5 bg-[#F5EFE9] rounded-xl">
              <span className="text-xs text-[#5A4E45] font-semibold">WSJF Score</span>
              <span className="font-mono text-base font-bold text-[#1E1712]">{wsjf}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 05 · БЕЙДЖІ ТА МАТРИЦЯ */}
      <section className="pt-8 border-t border-[#EDE5DD]">
        <div className="font-mono text-xs uppercase tracking-widest text-[#8B7D72] mb-1">
          05 · Стани та матриця
        </div>
        <h2 className="text-xl font-bold text-[#1E1712] mb-5">Бейджі пріоритету та матриця Impact × Urgency</h2>
        <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 space-y-6">
          <div className="space-y-3">
            <div className="text-xs font-semibold text-[#5A4E45]">Пріоритет P1–P4</div>
            <div className="flex flex-wrap gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8E1F19] bg-[#FBE8E6] border border-[#F3CFCB] rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C22B22]" /> P1 · Критичний
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#92580A] bg-[#FDF1DC] border border-[#F3DFB8] rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" /> P2 · Високий
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#235C68] bg-[#E4F1F3] border border-[#C7E1E5] rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2F7D8C]" /> P3 · Середній
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6A5D53] bg-[#F1ECE7] border border-[#E1D8D0] rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B7D72]" /> P4 · Низький
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[#F2EBE4]">
            <div className="text-xs font-semibold text-[#5A4E45]">
              Матриця Impact × Urgency ➔ Пріоритет
            </div>
            <div className="flex gap-6 flex-wrap items-start">
              <div className="grid grid-cols-[80px_repeat(3,84px)] gap-1.5">
                <div />
                <div className="text-[11px] text-[#8B7D72] text-center">Висока</div>
                <div className="text-[11px] text-[#8B7D72] text-center">Середня</div>
                <div className="text-[11px] text-[#8B7D72] text-center">Низька</div>

                {impacts.map(([iKey, iLabel]) => (
                  <React.Fragment key={iKey}>
                    <div className="text-[11px] text-[#8B7D72] flex items-center justify-end pr-2 font-medium">
                      {iLabel}
                    </div>
                    {urgencies.map((uKey) => {
                      const p = getPriorityFromMatrix(iKey, uKey);
                      const t = tones[p];
                      const isSelected = impact === iKey && urgency === uKey;
                      const borderStyle = isSelected ? t[1] : t[2];
                      const ringClass = isSelected ? 'ring-2 ring-[#E8663B] shadow-sm' : '';
                      return (
                        <button
                          key={`${iKey}-${uKey}`}
                          type="button"
                          onClick={() => {
                            setImpact(iKey);
                            setUrgency(uKey);
                          }}
                          className={`h-11 rounded-lg font-mono text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${ringClass}`}
                          style={{
                            backgroundColor: t[0],
                            color: t[1],
                            border: `1px solid ${borderStyle}`,
                          }}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>

              <div className="flex flex-col gap-1.5 p-3.5 bg-[#F5EFE9] rounded-2xl min-w-[200px]">
                <div className="text-[11px] font-mono uppercase tracking-widest text-[#8B7D72]">
                  Обчислено
                </div>
                <div className="text-xs text-[#5A4E45]">
                  Impact: {impacts.find((i) => i[0] === impact)?.[1]} · Urgency:{' '}
                  {getUrgencyLabel(urgency)}
                </div>
                <div className="text-xl font-bold text-[#1E1712]">
                  {currentPriority} · {priorityLabels[currentPriority]}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 07 · ТАЙМЛАЙН СТАТУСІВ */}
      <section className="pt-8 border-t border-[#EDE5DD]">
        <div className="font-mono text-xs uppercase tracking-widest text-[#8B7D72] mb-1">
          07 · Прогрес
        </div>
        <h2 className="text-xl font-bold text-[#1E1712] mb-5">Таймлайн статусів</h2>
        <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5">
          <div className="text-xs font-semibold text-[#5A4E45] mb-4">
            Горизонтальний · гілка A / B / E (ТЗ ➔ Розробка ➔ UAT)
          </div>
          <div className="flex items-start overflow-x-auto pb-2">
            {stepDefs.map(([label, stVal], i) => {
              const st = Number(stVal);
              const circleClass = getStepCircleClass(st);
              const textClass = getStepTextClass(st);
              const leftLineBg = getStepLeftLineBg(i, st);
              const isLast = i === stepDefs.length - 1;
              const rightLineBg = getStepRightLineBg(isLast, st);

              return (
                <div key={label} className="flex flex-col items-center gap-2 min-w-[96px] flex-1">
                  <div className="flex items-center w-full">
                    <div className={`h-0.5 flex-1 ${leftLineBg}`} />
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${circleClass}`} />
                    <div className={`h-0.5 flex-1 ${rightLineBg}`} />
                  </div>
                  <div className={`text-[11px] text-center px-1 font-medium ${textClass}`}>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 08 · ЗВОРОТНИЙ ЗВ'ЯЗОК */}
      <section className="pt-8 border-t border-[#EDE5DD]">
        <div className="font-mono text-xs uppercase tracking-widest text-[#8B7D72] mb-1">
          08 · Зворотний зв'язок
        </div>
        <h2 className="text-xl font-bold text-[#1E1712] mb-5">Модалка, тост, інтерактив</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 space-y-3">
            <div className="text-xs font-semibold text-[#5A4E45]">Живі стани</div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="text-xs font-semibold text-[#1E1712] bg-white hover:bg-[#F5EFE9] border border-[#DED4CA] rounded-xl px-4 h-9 cursor-pointer"
              >
                Відкрити модалку
              </button>
              <button
                type="button"
                onClick={fireToast}
                className="text-xs font-semibold text-[#1E1712] bg-white hover:bg-[#F5EFE9] border border-[#DED4CA] rounded-xl px-4 h-9 cursor-pointer"
              >
                Показати тост
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 flex flex-col justify-between">
            <div className="text-xs font-semibold text-[#5A4E45] mb-2">Зразок тосту</div>
            <div className="flex gap-2.5 p-3 bg-white border border-[#EDE5DD] rounded-xl shadow-sm">
              <div className="w-2 h-2 rounded-full bg-[#2C7A5A] mt-1.5 flex-shrink-0" />
              <div className="flex flex-col">
                <div className="text-xs font-semibold text-[#1E1712]">Заявку HAM-1043 створено</div>
                <div className="text-[11px] text-[#8B7D72]">Синхронізовано з PostgreSQL</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Закрити модальне вікно"
            onClick={() => setModalOpen(false)}
            className="fixed inset-0 bg-[#1E1712]/40 backdrop-blur-sm cursor-default border-none"
          />
          <dialog
            open
            aria-labelledby="modal-title"
            className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-3.5 border-0 m-0 text-left"
          >
            <div className="flex flex-col gap-1">
              <h3 id="modal-title" className="text-base font-bold text-[#1E1712]">
                Відхилити заявку?
              </h3>
              <p className="text-xs text-[#5A4E45]">
                Автор отримає повідомлення. Коментар обов'язковий — він потрапить в аудит-журнал.
              </p>
            </div>
            <label htmlFor={modalTextareaId} className="sr-only">
              Причина відхилення
            </label>
            <textarea
              id={modalTextareaId}
              rows={3}
              placeholder="Причина відхилення..."
              className="text-xs text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl p-2.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] resize-none"
            />
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-xs font-semibold text-[#5A4E45] hover:bg-[#F5EFE9] rounded-xl px-3.5 h-9 cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-xs font-semibold text-white bg-[#C22B22] hover:bg-[#A31F18] rounded-xl px-4 h-9 cursor-pointer"
              >
                Відхилити
              </button>
            </div>
          </dialog>
        </div>
      )}

      {/* TOAST */}
      {toastOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex gap-2.5 p-3.5 bg-white border border-[#EDE5DD] rounded-xl shadow-xl animate-toast">
          <div className="w-2 h-2 rounded-full bg-[#2C7A5A] mt-1.5 flex-shrink-0" />
          <div className="flex flex-col">
            <div className="text-xs font-semibold text-[#1E1712]">Заявку HAM-1043 створено</div>
            <div className="text-[11px] text-[#8B7D72]">Синхронізовано з PostgreSQL</div>
          </div>
        </div>
      )}
    </div>
  );
};

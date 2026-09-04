/**
 * @file NomenclatureForm.tsx
 * @description Specialized ERP Master Data Intake Form component for
 * registering new nomenclature items, raw materials, equipment, and services
 * into the enterprise inventory catalog.
 *
 * Requirements Addressed:
 * - Enterprise Catalog Registration: Captures official full and abbreviated
 *   names, accounting classification, and measurement units.
 * - Tax & Customs Compliance: Enforces standard Ukrainian VAT rates and validates
 *   10-digit UKTZED commodity codes.
 * - Supply Chain Tracking: Collects primary suppliers, target warehouse
 *   destinations, monthly consumption estimates, and incoming quality control (QC).
 * - Multi-Asset Attachments: Handles client-side base64 conversion for item
 *   photographs and technical specification sheets up to 10MB.
 */

import React, { useState, useId, useMemo } from 'react';

/**
 * Component properties for the Nomenclature intake workflow.
 */
interface NomenclatureFormProps {
  serviceId: string;
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

/**
 * Encapsulated file attachment payload with base64 encoded content.
 */
interface AttachedFile {
  name: string;
  size: number;
  type: string;
  data: string;
}

/**
 * NomenclatureForm renders a multi-section form for registering new items
 * in the enterprise resource planning (ERP) database.
 *
 * @param {NomenclatureFormProps} props - Component properties.
 * @returns {React.ReactElement} The rendered nomenclature intake view.
 */
export const NomenclatureForm: React.FC<NomenclatureFormProps> = ({
  serviceId,
  onSuccess,
  onCancel,
}) => {
  // Stable accessibility IDs for form controls
  const fullNameId = useId();
  const shortNameId = useId();
  const itemTypeId = useId();
  const unitId = useId();
  const skuId = useId();
  const barcodeId = useId();
  const vatRateId = useId();
  const uktzedId = useId();
  const supplierId = useId();
  const warehouseId = useId();
  const monthlyRequirementId = useId();
  const needIncomingControlId = useId();
  const specLinkId = useId();
  const commentId = useId();

  // Section 1: Core nomenclature attributes
  const [fullName, setFullName] = useState('');
  const [shortName, setShortName] = useState('');
  const [itemType, setItemType] = useState('Матеріали');
  const [unit, setUnit] = useState('Штуки (шт)');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [vatRate, setVatRate] = useState('20% (Основна)');
  const [uktzed, setUktzed] = useState('');

  // Section 2: Procurement and warehousing attributes
  const [supplier, setSupplier] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [monthlyRequirement, setMonthlyRequirement] = useState('');
  const [needIncomingControl, setNeedIncomingControl] = useState('Ні');
  const [specLink, setSpecLink] = useState('');
  const [comment, setComment] = useState('');

  // Section 3: File attachments
  const [photo, setPhoto] = useState<AttachedFile | null>(null);
  const [docFile, setDocFile] = useState<AttachedFile | null>(null);

  // Submission and modal states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successModal, setSuccessModal] = useState<{
    open: boolean;
    requestNum: string;
  }>({
    open: false,
    requestNum: '',
  });

  /**
   * Converts a user-selected File object into a base64 AttachedFile record.
   *
   * @param {File} file - The uploaded binary file.
   * @returns {Promise<AttachedFile>} Base64 representation of the file.
   */
  const fileToBase64 = (file: File): Promise<AttachedFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1] || '';
        resolve({
          name: file.name,
          size: file.size,
          type: file.type,
          data: base64,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  /**
   * Handles file upload input events, enforcing the 10MB size limit.
   *
   * @param {React.ChangeEvent<HTMLInputElement>} event - The file change event.
   * @param {(file: AttachedFile | null) => void} fileSetter - State updater.
   */
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    fileSetter: (file: AttachedFile | null) => void
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      fileSetter(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Розмір файлу не повинен перевищувати 10MB.');
      event.target.value = '';
      fileSetter(null);
      return;
    }
    try {
      const parsedFile = await fileToBase64(file);
      fileSetter(parsedFile);
    } catch {
      alert('Не вдалося завантажити файл');
    }
  };

  /**
   * Normalizes UKTZED input to a maximum of 10 digits.
   *
   * @param {string} rawValue - Raw user input.
   */
  const handleUktzedChange = (rawValue: string): void => {
    const digitsOnly = rawValue.replace(/\D/g, '').slice(0, 10);
    setUktzed(digitsOnly);
  };

  /**
   * Auto-populates shortName from fullName if left blank.
   */
  const handleFullNameBlur = (): void => {
    if (!shortName.trim() && fullName.trim()) {
      setShortName(fullName.slice(0, 40));
    }
  };

  /**
   * Validates presence of mandatory ERP nomenclature fields.
   */
  const isFormValid = useMemo(() => {
    const hasFullName = fullName.trim().length >= 3;
    const hasItemType = itemType.length > 0;
    const hasUnit = unit.length > 0;
    const hasVatRate = vatRate.length > 0;
    return hasFullName && hasItemType && hasUnit && hasVatRate;
  }, [fullName, itemType, unit, vatRate]);

  /**
   * Resets all form fields to their initial states.
   */
  const handleReset = (): void => {
    setFullName('');
    setShortName('');
    setItemType('Матеріали');
    setUnit('Штуки (шт)');
    setSku('');
    setBarcode('');
    setVatRate('20% (Основна)');
    setUktzed('');
    setSupplier('');
    setWarehouse('');
    setMonthlyRequirement('');
    setNeedIncomingControl('Ні');
    setSpecLink('');
    setComment('');
    setPhoto(null);
    setDocFile(null);
  };

  /**
   * Dispatches the nomenclature creation request to the applications API.
   *
   * @param {React.FormEvent<HTMLFormElement>} event - Form submit event.
   */
  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);

    const payload = {
      nomenclature: {
        fullName: fullName.trim(),
        shortName: shortName.trim() || fullName.trim(),
        itemType,
        unit,
        sku: sku.trim(),
        barcode: barcode.trim(),
        vatRate,
        uktzed: uktzed.trim(),
        supplier: supplier.trim(),
        warehouse: warehouse.trim(),
        monthlyRequirement: monthlyRequirement.trim(),
        needIncomingControl: needIncomingControl === 'Так',
        specLink: specLink.trim(),
        comment: comment.trim(),
        photo: photo
          ? { name: photo.name, size: photo.size, type: photo.type }
          : null,
        docFile: docFile
          ? { name: docFile.name, size: docFile.size, type: docFile.type }
          : null,
      },
    };

    const supplierStr = supplier.trim() || '—';
    const warehouseStr = warehouse.trim() || '—';
    const uktzedStr = uktzed.trim() || '—';
    const commentSuffix = comment.trim()
      ? ` Коментар: ${comment.trim()}`
      : '';
    const description = `Створення номенклатури: «${fullName.trim()}» [${itemType}, ${unit}]. Постачальник: ${supplierStr}, Склад: ${warehouseStr}, Вхідний контроль: ${needIncomingControl}, ПДВ: ${vatRate}, УКТЗЕД: ${uktzedStr}.${commentSuffix}`;

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantName: 'Авторизований користувач ERP',
          type: 'SERVICE_REQUEST',
          priority: 'MEDIUM',
          description,
          serviceCatalogId: serviceId,
          formType: 'A',
          subtype: 'Номенклатура',
          payload,
          bv: 3,
          r: 3,
          tc: 3,
          wsjf: 6.0,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(
          `Помилка створення заявки: ${
            errorData.error || 'Перевірте обов’язкові поля'
          }`
        );
        setIsSubmitting(false);
        return;
      }

      const created = await response.json();
      const rawNum = created.id.replace(/\D/g, '').slice(-5);
      const paddedNum = (rawNum || '00042').padStart(5, '0');
      setSuccessModal({ open: true, requestNum: paddedNum });
    } catch (networkError: unknown) {
      const errorMessage =
        networkError instanceof Error
          ? networkError.message
          : String(networkError);
      alert(`Помилка зв'язку з сервером: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Closes the confirmation dialog and notifies parent of success.
   */
  const handleModalClose = (): void => {
    setSuccessModal({ open: false, requestNum: '' });
    onSuccess(
      `Заявку на номенклатуру #${successModal.requestNum} успішно подано та передано в чергу ERP!`
    );
  };

  return (
    <section className="bg-white border border-[#EDE5DD] rounded-2xl p-6 sm:p-7 shadow-[0_2px_12px_rgba(62,36,23,0.03)] space-y-6">
      {/* 1. HEADER */}
      <div className="flex items-center justify-between pb-3 border-b border-[#F2EBE4] flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E8663B]" />
          <div>
            <h2 className="text-base font-bold text-[#1E1712]">
              Створення нової номенклатури для ERP
            </h2>
            <div className="text-[11px] text-[#8B7D72]">
              Внесення позицій до довідника матеріалів, сировини, товарів та
              послуг
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono text-[#8B7D72] bg-[#F5EFE9] px-2.5 py-1 rounded-lg">
            SLA: 2-4 год
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-[#5A4E45] hover:text-[#1E1712] bg-[#F5EFE9] hover:bg-[#EDE5DD] px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
          >
            Змінити сервіс
          </button>
        </div>
      </div>

      {/* Required fields indicator */}
      <div className="flex items-center justify-between p-3 bg-[#FBF8F5] border border-[#EDE5DD] rounded-xl text-xs text-[#5A4E45]">
        <div className="flex items-center gap-2">
          <span className="text-[#C22B22] font-bold text-sm leading-none">
            *
          </span>
          <span>
            Поля, позначені червоною зірочкою, є{' '}
            <strong>обов'язковими</strong> для подачі заявки.
          </span>
        </div>
        <span className="text-[11px] text-[#8B7D72] hidden sm:inline">
          SSO: автор визначається автоматично
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ========================================================= */}
        {/* SECTION 1: CORE NOMENCLATURE ATTRIBUTES                   */}
        {/* ========================================================= */}
        <div className="space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-[#5A4E45] font-mono flex items-center gap-1.5">
            <span>📦</span>
            <span>Основні атрибути номенклатури</span>
          </div>

          {/* Full name and Short name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={fullNameId}
                  className="text-xs font-semibold text-[#1E1712] flex items-center gap-1"
                >
                  Повна назва номенклатури{' '}
                  <span className="text-[#C22B22] font-bold">*</span>
                </label>
                <span className="text-[10px] font-semibold text-[#C22B22] bg-[#FDF0EE] px-1.5 py-0.5 rounded">
                  Обов'язково
                </span>
              </div>
              <input
                id={fullNameId}
                type="text"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                onBlur={handleFullNameBlur}
                placeholder="напр. Кабель силовий мідний ВВГнг 3х2.5 мм²"
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] transition-all"
              />
              <span className="text-[11px] text-[#8B7D72]">
                Офіційне найменування для договорів, накладних та специфікацій
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={shortNameId}
                  className="text-xs font-semibold text-[#5A4E45]"
                >
                  Скорочена назва (для накладних)
                </label>
                <span className="text-[10px] text-[#8B7D72]">
                  Необов'язково
                </span>
              </div>
              <input
                id={shortNameId}
                type="text"
                value={shortName}
                onChange={(event) => setShortName(event.target.value)}
                placeholder="напр. ВВГнг 3х2.5"
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] transition-all"
              />
              <span className="text-[11px] text-[#8B7D72]">
                Робоча назва для компактного відображення в таблицях та складських
                ярликах
              </span>
            </div>
          </div>

          {/* Item type and Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={itemTypeId}
                  className="text-xs font-semibold text-[#1E1712] flex items-center gap-1"
                >
                  Вид номенклатури{' '}
                  <span className="text-[#C22B22] font-bold">*</span>
                </label>
                <span className="text-[10px] font-semibold text-[#C22B22] bg-[#FDF0EE] px-1.5 py-0.5 rounded">
                  Обов'язково
                </span>
              </div>
              <select
                id={itemTypeId}
                required
                value={itemType}
                onChange={(event) => setItemType(event.target.value)}
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] transition-all"
              >
                <option value="Матеріали">Матеріали</option>
                <option value="Сировина">Сировина</option>
                <option value="Товар">Товар</option>
                <option value="Готова продукція">Готова продукція</option>
                <option value="Напівфабрикат">Напівфабрикат</option>
                <option value="Запасні частини (ЗІП)">Запасні частини (ЗІП)</option>
                <option value="Послуга">Послуга</option>
                <option value="Основні засоби (ОЗ)">Основні засоби (ОЗ)</option>
                <option value="Малоцінні швидкозношувані предмети (МШП)">
                  МШП
                </option>
              </select>
              <span className="text-[11px] text-[#8B7D72]">
                Визначає рахунок бухгалтерського та складського обліку в ERP
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={unitId}
                  className="text-xs font-semibold text-[#1E1712] flex items-center gap-1"
                >
                  Одиниця виміру{' '}
                  <span className="text-[#C22B22] font-bold">*</span>
                </label>
                <span className="text-[10px] font-semibold text-[#C22B22] bg-[#FDF0EE] px-1.5 py-0.5 rounded">
                  Обов'язково
                </span>
              </div>
              <select
                id={unitId}
                required
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] transition-all"
              >
                <option value="Штуки (шт)">Штуки (шт)</option>
                <option value="Кілограми (кг)">Кілограми (кг)</option>
                <option value="Тонни (т)">Тонни (т)</option>
                <option value="Літри (л)">Літри (л)</option>
                <option value="Метри (м)">Метри (м)</option>
                <option value="Метри квадратні (м²)">Метри квадратні (м²)</option>
                <option value="Метри кубічні (м³)">Метри кубічні (м³)</option>
                <option value="Комплекти (компл)">Комплекти (компл)</option>
                <option value="Упаковки (упак)">Упаковки (упак)</option>
                <option value="Палета">Палета</option>
                <option value="Послуга">Послуга</option>
              </select>
              <span className="text-[11px] text-[#8B7D72]">
                Базова одиниця для списання та інвентаризації
              </span>
            </div>
          </div>

          {/* Codification: SKU, Barcode, VAT, UKTZED */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={skuId}
                  className="text-xs font-semibold text-[#5A4E45]"
                >
                  Артикул / Каталожний №
                </label>
                <span className="text-[10px] text-[#8B7D72]">
                  Необов'язково
                </span>
              </div>
              <input
                id={skuId}
                type="text"
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                placeholder="напр. VVG-3X2.5-NG"
                className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              />
              <span className="text-[11px] text-[#8B7D72]">
                Артикул виробника
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={barcodeId}
                  className="text-xs font-semibold text-[#5A4E45]"
                >
                  Штрихкод (EAN / UPC)
                </label>
                <span className="text-[10px] text-[#8B7D72]">
                  Необов'язково
                </span>
              </div>
              <input
                id={barcodeId}
                type="text"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                placeholder="4820000000000"
                className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              />
              <span className="text-[11px] text-[#8B7D72]">
                EAN-13 або внутрішній
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={vatRateId}
                  className="text-xs font-semibold text-[#1E1712] flex items-center gap-1"
                >
                  Ставка ПДВ <span className="text-[#C22B22] font-bold">*</span>
                </label>
                <span className="text-[10px] font-semibold text-[#C22B22] bg-[#FDF0EE] px-1.5 py-0.5 rounded">
                  Обов'язково
                </span>
              </div>
              <select
                id={vatRateId}
                required
                value={vatRate}
                onChange={(event) => setVatRate(event.target.value)}
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-2.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              >
                <option value="20% (Основна)">20% (Основна)</option>
                <option value="7% (Фарм / Медвироби)">
                  7% (Фарм / Медвироби)
                </option>
                <option value="0% (Експорт)">0% (Експорт)</option>
                <option value="Без ПДВ">Без ПДВ</option>
              </select>
              <span className="text-[11px] text-[#8B7D72]">
                Для податкового обліку
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={uktzedId}
                  className="text-xs font-semibold text-[#5A4E45]"
                >
                  Код УКТЗЕД
                </label>
                {uktzed.length === 10 ? (
                  <span className="text-[10px] font-semibold text-[#2C7A5A]">
                    ✓ 10 знаків
                  </span>
                ) : (
                  <span className="text-[10px] text-[#8B7D72]">
                    Необов'язково
                  </span>
                )}
              </div>
              <input
                id={uktzedId}
                type="text"
                maxLength={10}
                value={uktzed}
                onChange={(event) => handleUktzedChange(event.target.value)}
                placeholder="8544 49 91 00"
                className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              />
              <span className="text-[11px] text-[#8B7D72]">
                10 цифр класифікатора
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* SECTION 2: PROCUREMENT AND WAREHOUSING                    */}
        {/* ========================================================= */}
        <div className="space-y-4 pt-4 border-t border-[#F2EBE4]">
          <div className="text-xs font-bold uppercase tracking-wider text-[#5A4E45] font-mono flex items-center gap-1.5">
            <span>🏭</span>
            <span>Постачання та складське зберігання</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={supplierId}
                  className="text-xs font-semibold text-[#5A4E45]"
                >
                  Основний постачальник / Виробник
                </label>
                <span className="text-[10px] text-[#8B7D72]">
                  Необов'язково
                </span>
              </div>
              <input
                id={supplierId}
                type="text"
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                placeholder="ТОВ / Завод-виробник"
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              />
              <span className="text-[11px] text-[#8B7D72]">
                Контрагент або бренд
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={warehouseId}
                  className="text-xs font-semibold text-[#5A4E45]"
                >
                  Склад призначення / Цех
                </label>
                <span className="text-[10px] text-[#8B7D72]">
                  Необов'язково
                </span>
              </div>
              <input
                id={warehouseId}
                type="text"
                value={warehouse}
                onChange={(event) => setWarehouse(event.target.value)}
                placeholder="Головний склад / Цех №1"
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              />
              <span className="text-[11px] text-[#8B7D72]">
                Склад первинного оприбуткування
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={monthlyRequirementId}
                  className="text-xs font-semibold text-[#5A4E45]"
                >
                  Орієнтовна потреба на місяць
                </label>
                <span className="text-[10px] text-[#8B7D72]">
                  Необов'язково
                </span>
              </div>
              <input
                id={monthlyRequirementId}
                type="text"
                value={monthlyRequirement}
                onChange={(event) => setMonthlyRequirement(event.target.value)}
                placeholder="напр. 500 шт"
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              />
              <span className="text-[11px] text-[#8B7D72]">
                Для планового відділу закупівель
              </span>
            </div>
          </div>

          {/* Incoming control and datasheet URL */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1.5 sm:col-span-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={needIncomingControlId}
                  className="text-xs font-semibold text-[#5A4E45]"
                >
                  Потрібен вхідний контроль
                </label>
              </div>
              <select
                id={needIncomingControlId}
                value={needIncomingControl}
                onChange={(event) => setNeedIncomingControl(event.target.value)}
                className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              >
                <option value="Ні">Ні</option>
                <option value="Так">Так</option>
              </select>
              <span className="text-[11px] text-[#8B7D72]">
                Перевірка якості перед оприбуткуванням
              </span>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor={specLinkId}
                  className="text-xs font-semibold text-[#5A4E45]"
                >
                  Посилання на технічну специфікацію / паспорт (URL)
                </label>
                <span className="text-[10px] text-[#8B7D72]">
                  Необов'язково
                </span>
              </div>
              <input
                id={specLinkId}
                type="url"
                value={specLink}
                onChange={(event) => setSpecLink(event.target.value)}
                placeholder="https://docs.company.local/specs/item-datasheet.pdf"
                className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
              />
              <span className="text-[11px] text-[#8B7D72]">
                Посилання на сайт виробника, креслення або PDF-документацію
              </span>
            </div>
          </div>

          {/* Operational notes */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor={commentId}
                className="text-xs font-semibold text-[#5A4E45]"
              >
                Додатковий коментар / Призначення номенклатури
              </label>
              <span className="text-[10px] text-[#8B7D72]">
                Необов'язково
              </span>
            </div>
            <textarea
              id={commentId}
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Вкажіть особливості обліку, умови зберігання або для якого проекту використовується..."
              className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl p-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] resize-none"
            />
            <span className="text-[11px] text-[#8B7D72]">
              Будь-які примітки щодо аналогів, температурного режиму або
              комплектації
            </span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* SECTION 3: FILE ATTACHMENTS (SPEC / PHOTO)                */}
        {/* ========================================================= */}
        <div className="bg-[#FBF8F5] border border-[#EDE5DD] rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[#5A4E45] font-mono flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>📎</span>
              <span>Прикріплення документів та фото</span>
            </span>
            <span className="text-[11px] text-[#8B7D72] font-normal">
              Необов'язково
            </span>
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            {/* Photo upload */}
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#F5EFE9] text-[#1E1712] border border-[#DED4CA] rounded-xl text-xs font-semibold transition-colors shadow-sm">
                <span>📸 Фото позиції</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleFileUpload(event, setPhoto)}
                />
              </label>
              <span
                className={`text-xs ${
                  photo ? 'text-[#2C7A5A] font-semibold' : 'text-[#8B7D72]'
                }`}
              >
                {photo ? `✓ ${photo.name}` : 'Не обрано'}
              </span>
            </div>

            {/* Document upload */}
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#F5EFE9] text-[#1E1712] border border-[#DED4CA] rounded-xl text-xs font-semibold transition-colors shadow-sm">
                <span>📄 Паспорт / Сертифікат (PDF)</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={(event) => handleFileUpload(event, setDocFile)}
                />
              </label>
              <span
                className={`text-xs ${
                  docFile ? 'text-[#2C7A5A] font-semibold' : 'text-[#8B7D72]'
                }`}
              >
                {docFile ? `✓ ${docFile.name}` : 'Не обрано'}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* ACTIONS & DISPATCH                                        */}
        {/* ========================================================= */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className={`text-sm font-semibold rounded-xl px-6 h-10 shadow-sm transition-all flex items-center justify-center gap-2 ${
              isFormValid && !isSubmitting
                ? 'bg-[#E8663B] hover:bg-[#C7522F] text-white cursor-pointer active:scale-98'
                : 'bg-[#F5EFE9] text-[#B5A9A0] border border-[#EDE5DD] cursor-not-allowed'
            }`}
          >
            {(() => {
              if (isSubmitting) {
                return (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Створення...
                  </span>
                );
              }
              if (isFormValid) {
                return '💾 Створити заявку на номенклатуру';
              }
              return 'Заповніть обов’язкові поля (*)';
            })()}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="text-sm font-semibold text-[#5A4E45] hover:bg-[#F5EFE9] hover:text-[#1E1712] rounded-xl px-4 h-10 transition-colors cursor-pointer"
          >
            Очистити
          </button>
        </div>
      </form>

      {/* Confirmation Modal */}
      {successModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Закрити модальне вікно"
            onClick={handleModalClose}
            className="fixed inset-0 bg-[#1E1712]/40 backdrop-blur-sm cursor-default border-none"
          />
          <dialog
            open
            aria-labelledby="success-modal-title"
            className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center space-y-4 border-0 m-0"
          >
            <div className="w-12 h-12 rounded-full bg-[#EAF5EE] border border-[#CDE9D7] text-[#2C7A5A] flex items-center justify-center text-xl mx-auto">
              ✓
            </div>
            <div className="space-y-1.5">
              <h3
                id="success-modal-title"
                className="text-base font-bold text-[#1E1712]"
              >
                Заявку на номенклатуру створено!
              </h3>
              <p className="text-sm text-[#5A4E45] leading-relaxed">
                Ваш запит №{' '}
                <span className="font-mono font-bold text-[#E8663B] text-base">
                  #{successModal.requestNum}
                </span>
                <br />
                успішно зареєстровано в черзі опрацювання ERP.
              </p>
            </div>
            <button
              type="button"
              onClick={handleModalClose}
              className="w-full h-10 bg-[#E8663B] hover:bg-[#C7522F] text-white font-bold text-sm rounded-xl transition-colors cursor-pointer"
            >
              OK
            </button>
          </dialog>
        </div>
      )}
    </section>
  );
};

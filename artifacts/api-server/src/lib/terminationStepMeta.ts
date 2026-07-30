/**
 * Public-facing metadata for termination (offboarding) steps.
 *
 * Same shape as ROUTING_STEP_META — see routingStepMeta.ts for the rationale.
 *
 * The employee sees this on the public termination-status page (tokenized link
 * sent by email after HR creates the termination sheet).
 *
 * For offboarding the "cabinet" field tells the employee which department /
 * office will handle their step. For steps that don't require any employee
 * action (e.g. accounting calculation, security check) the instructions field
 * explains that nothing is required from them — just wait for confirmation.
 *
 * Admin can override any of these per step type via the `step_meta` table
 * (managed through /admin/step-meta UI); see loadTerminationStepMeta().
 */

import { db, stepMetaTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface TerminationStepMeta {
  label: string;
  cabinet: string;
  instructions: string;
}

export const TERMINATION_STEP_META: Record<string, TerminationStepMeta> = {
  chief_physician_off: {
    label: "Согласование главного врача",
    cabinet: "Кабинет главного врача, 3 этаж, каб. 301",
    instructions:
      "Главный врач подтверждает отсутствие незакрытых медицинских " +
      "дел и материалов. От сотрудника ничего не требуется — шаг " +
      "выполняется главным врачом.",
  },
  it_revocation: {
    label: "Отзыв IT-доступов",
    cabinet: "IT-отдел, 2 этаж, каб. 210",
    instructions:
      "IT-отдел отключает учётные записи (почта, CRM, внутренние системы) " +
      "и забирает корпоративное оборудование (ноутбук, телефон, ключи " +
      "доступа). Сдайте оборудование в рабочем состоянии.",
  },
  marketing_off: {
    label: "Маркетинговое оформление",
    cabinet: "Отдел маркетинга, 2 этаж, каб. 205",
    instructions:
      "Маркетинг удаляет ваш профиль с корпоративного сайта и сторонних " +
      "площадок, изымает фото из опубликованных материалов. От сотрудника " +
      "ничего не требуется.",
  },
  accounting_off: {
    label: "Финансовый расчёт",
    cabinet: "Бухгалтерия, 1 этаж, каб. 115",
    instructions:
      "Бухгалтерия производит окончательный расчёт: зарплата, компенсация " +
      "за неиспользованный отпуск, удержания. Получите расчётный листок и " +
      "справку 2-НДФЛ.",
  },
  security_off: {
    label: "Проверка безопасности",
    cabinet: "Служба безопасности, 1 этаж, каб. 108",
    instructions:
      "Служба безопасности проверяет отсутствие задолженностей по " +
      "материальным ценностям и подписанным обязательствам. Сдайте " +
      "пропуск и ключи от кабинета/шкафчика.",
  },
  hr_exit_interview: {
    label: "Интервью HR-адаптации",
    cabinet: "Кабинет HR-адаптации, 1 этаж, каб. 103",
    instructions:
      "Пройдите заключительное интервью с HR-менеджером: обсудите причины " +
      "ухода, обратную связь и передачу дел. Заполняется анкета exit-interview.",
  },
  hr_close: {
    label: "Закрытие HR-специалистом",
    cabinet: "Кабинет HR, 1 этаж, каб. 102",
    instructions:
      "HR-специалист подписывает приказ об увольнении, передаёт трудовую " +
      "книжку и необходимые справки. Проверьте, что все документы получены.",
  },
  medical_equipment_off: {
    label: "Медтехника и оборудование",
    cabinet: "Отдел медтехники, цокольный этаж, каб. 003",
    instructions:
      "Сдайте закреплённое медицинское оборудование, расходные материалы " +
      "и инструменты. Подпишите акт приёма-передачи.",
  },
  account_manager_delete_profile: {
    label: "Удаление профиля с сайтов",
    cabinet: "Отдел аккаунт-менеджмента, 2 этаж, каб. 207",
    instructions:
      "Аккаунт-менеджер удаляет профиль врача со сторонних медицинских " +
      "площадок и агрегаторов. Шаг только для врачей — без него процесс " +
      "не закрывается.",
  },
};

/** Default step order (matches BASE_STEPS in lib/terminationSheet.ts + doctor step at the end). */
export const TERMINATION_PUBLIC_STEP_ORDER: string[] = [
  "chief_physician_off",
  "it_revocation",
  "marketing_off",
  "accounting_off",
  "security_off",
  "hr_exit_interview",
  "medical_equipment_off",
  "hr_close",
  // doctor-only, shown last when present
  "account_manager_delete_profile",
];

/**
 * Load admin overrides from the `step_meta` table (sheet_kind = 'termination')
 * and merge them with the hardcoded defaults. Admin-edited values win.
 */
export async function loadTerminationStepMeta(): Promise<Record<string, TerminationStepMeta>> {
  const result: Record<string, TerminationStepMeta> = {};
  for (const [k, v] of Object.entries(TERMINATION_STEP_META)) {
    result[k] = { ...v };
  }
  try {
    const rows = await db.select().from(stepMetaTable)
      .where(eq(stepMetaTable.sheetKind, "termination"));
    for (const row of rows) {
      result[row.stepType] = {
        label: row.label,
        cabinet: row.cabinet ?? "",
        instructions: row.instructions ?? "",
      };
    }
  } catch {
    // Fall back to defaults if DB unavailable
  }
  return result;
}

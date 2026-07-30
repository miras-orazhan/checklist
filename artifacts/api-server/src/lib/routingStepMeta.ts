/**
 * Public-facing metadata for routing sheet steps (hiring/onboarding).
 *
 * Each step gets:
 *   label        — short human-readable title shown on the candidate status page
 *   cabinet      — physical office / room / department the candidate needs to visit
 *   instructions — what the candidate needs to bring or do at this step
 *
 * These are static defaults — they apply to every branch. Admin can override
 * them per step type via the `step_meta` table (managed through
 * /admin/step-meta UI); see loadRoutingStepMetaOverrides().
 *
 * The instructions text is shown verbatim on the public candidate status page,
 * so keep it short, action-oriented, and in Russian (the spec calls for
 * Russian-only UI).
 */

import { db, stepMetaTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface RoutingStepMeta {
  label: string;
  cabinet: string;
  instructions: string;
}

export const ROUTING_STEP_META: Record<string, RoutingStepMeta> = {
  hr_registration: {
    label: "Оформление (HR)",
    cabinet: "Кабинет HR, 1 этаж, каб. 102",
    instructions:
      "Предоставьте паспорт, СНИЛС, ИНН, военный билет (при наличии), " +
      "трудовую книжку (или данные для электронной). Подпишите трудовой договор " +
      "и заявление о приёме на работу.",
  },
  marketing_photo: {
    label: "Фото (Маркетинг)",
    cabinet: "Отдел маркетинга, 2 этаж, каб. 205",
    instructions:
      "Подойдите для фотографирования — паспорт с собой не требуется. " +
      "Одежда: деловой стиль, однотонная. Фото будет использовано в бейдже " +
      "и на корпоративном сайте.",
  },
  tb_briefing: {
    label: "Инструктаж ТБ",
    cabinet: "Кабинет охраны труда, 1 этаж, каб. 110",
    instructions:
      "Пройдите вводный инструктаж по технике безопасности и охране труда. " +
      "После инструктажа распишитесь в журнале. Занятие ≈ 30 минут.",
  },
  it_accounts: {
    label: "Учётные записи (IT)",
    cabinet: "IT-отдел, 2 этаж, каб. 210",
    instructions:
      "Получите учётные данные от корпоративной почты, CRM и внутренних " +
      "систем. Подпишите согласие на обработку персональных данных в " +
      "электронном виде.",
  },
  audit_training: {
    label: "Обучение (Аудит)",
    cabinet: "Учебный класс, 3 этаж, каб. 305",
    instructions:
      "Пройдите обучение по внутренним регламентам, противодействию " +
      "коррупции и защите персональных данных. В конце — короткий тест. " +
      "Длительность ≈ 2 часа.",
  },
  doctor_profile: {
    label: "Профиль врача",
    cabinet: "Кабинет главного врача, 3 этаж, каб. 301",
    instructions:
      "Заполняется главным врачом совместно с вами: опыт работы, " +
      "специализация, возрастные ограничения, список процедур, " +
      "краткое описание для сайта. От вас — подтверждение данных.",
  },
  site_publication: {
    label: "Публикация на сайте",
    cabinet: "Отдел маркетинга, 2 этаж, каб. 205",
    instructions:
      "Ваш профиль будет опубликован на корпоративном сайте и сторонних " +
      "медицинских площадках. От вас ничего не требуется — шаг выполняется " +
      "после готовности фото и профиля.",
  },
  final_review: {
    label: "Финальная проверка",
    cabinet: "Кабинет рекрутера, 1 этаж, каб. 105",
    instructions:
      "Рекрутер проверяет все шаги и закрывает обходной лист. От вас — " +
      "подтвердить дату первого рабочего дня и забрать бейдж.",
  },
};

/** Default step order (excluding background doctor steps that the candidate never sees). */
export const ROUTING_PUBLIC_STEP_ORDER: string[] = [
  "hr_registration",
  "marketing_photo",
  "tb_briefing",
  "it_accounts",
  "audit_training",
  "final_review",
];

/**
 * Load admin overrides from the `step_meta` table (sheet_kind = 'routing') and
 * merge them with the hardcoded defaults. Admin-edited values win.
 *
 * Returns a complete map keyed by stepType, suitable for direct use by the
 * candidate-status endpoint.
 */
export async function loadRoutingStepMeta(): Promise<Record<string, RoutingStepMeta>> {
  const result: Record<string, RoutingStepMeta> = {};
  // Start with defaults
  for (const [k, v] of Object.entries(ROUTING_STEP_META)) {
    result[k] = { ...v };
  }

  // Apply DB overrides
  try {
    const rows = await db.select().from(stepMetaTable)
      .where(eq(stepMetaTable.sheetKind, "routing"));
    for (const row of rows) {
      result[row.stepType] = {
        label: row.label,
        cabinet: row.cabinet ?? "",
        instructions: row.instructions ?? "",
      };
    }
  } catch {
    // Fall back to defaults if DB unavailable (shouldn't happen in normal flow)
  }

  return result;
}

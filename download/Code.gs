/**
 * ============================================================================
 *  Google Apps Script — отправка транзакционных писем для «Обходного листа»
 * ============================================================================
 *
 *  Что делает:
 *    Принимает POST-запрос от бэкенда (https://script.google.com/macros/s/.../exec)
 *    и отправляет HTML-письмо через Gmail с адреса владельца скрипта.
 *
 *  Формат запроса (JSON), который шлёт бэкенд (см. services/email.ts):
 *    POST
 *    Content-Type: application/json
 *    Body:
 *    {
 *      "to":       "candidate@example.com",
 *      "subject":  "Приглашение на оффер — ...",
 *      "htmlBody": "<!DOCTYPE html>...",
 *      "secret":   "your-shared-secret-here"   // необязательно
 *    }
 *
 *  Ответ при успехе:
 *    { "ok": true, "messageId": "<...>@ismtpd0003>" }
 *
 *  Ответ при ошибке:
 *    HTTP 4xx/5xx, body: { "ok": false, "error": "..." }
 *
 * ============================================================================
 *  КАК УСТАНОВИТЬ
 * ============================================================================
 *
 *  1. Откройте https://script.google.com  →  «Новый проект»
 *  2. Удалите всё из Code.gs и вставьте содержимое этого файла целиком.
 *  3. (необязательно) Поменяйте SHARED_SECRET на свою строку — это защита от
 *     посторонних запросов. Если оставите пустым, проверка секретом отключится.
 *  4. Нажмите «Начать развертывание» → «Новое развертывание».
 *       Тип:             «Веб-приложение»
 *       Выполнять как:   «Я» (ваш Google-аккаунт — с него будут уходить письма)
 *       Доступ:          «У кого есть доступ — Любой»
 *     (Да, «Любой» — иначе бэкенд не сможет достучаться. Это нормально для
 *      веб-приложений GAS без OAuth.)
 *  5. Скопируйте URL вида
 *       https://script.google.com/macros/s/AKfycb.../exec
 *     — это и есть ваш webhook URL.
 *  6. Зайдите в админку приложения (https://preview-zai-web.space-z.ai/admin/integrations),
 *     вставьте URL в поле «GAS Webhook URL», при необходимости задайте
 *     «GAS Webhook Secret» и сохраните.
 *
 *  Письма пойдут с адреса вашего Google-аккаунта. Суточный лимит Gmail —
 *  100 писем для бесплатных аккаунтов, 1500 для Workspace. Для dev/демо
 *  этого более чем достаточно.
 *
 * ============================================================================
 *  ПРОВЕРКА ВРУЧНУЮ
 * ============================================================================
 *
 *  После публикации отправьте из консоли браузера или terminal:
 *
 *    curl -X POST "https://script.google.com/macros/s/ВАШ_ID/exec" \
 *      -H "Content-Type: application/json" \
 *      -d '{
 *        "to":"your.email@gmail.com",
 *        "subject":"Тест",
 *        "htmlBody":"<h1>Привет!</h1>",
 *        "secret":""
 *      }'
 *
 *  В ответ должно прийти:
 *    {"ok":true,"messageId":"..."}
 *
 * ============================================================================
 */

/**
 * Общий секрет. Если не пустой — каждый входящий POST должен прислать тот же
 * secret в теле запроса. Поменяйте на любую случайную строку перед публикацией
 * (например, сгенерируйте 32 байта: https://1password.com/password-generator/).
 */
const SHARED_SECRET = '';

/**
 * Дополнительно: «белый список» разрешённых адресов получателей.
 * Если массив пуст — ограничений нет.
 * Полезно на dev-стенде, чтобы случайно не разослать письма реальным людям.
 *
 * Пример:
 *   const ALLOWED_RECIPIENTS = ['dev@example.com', 'test@example.com'];
 */
const ALLOWED_RECIPIENTS = [];

/** Максимальный размер HTML-тела письма (защита от случайного гиганта). */
const MAX_BODY_BYTES = 1_000_000; // 1 MB

/**
 * Точка входа веб-приложения.
 * GAS вызывает doPost(e) для каждого входящего POST.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut(400, { ok: false, error: 'Empty request body' });
    }

    /** @type {{to:string, subject:string, htmlBody:string, secret?:string}} */
    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut(400, { ok: false, error: 'Invalid JSON: ' + err.message });
    }

    // --- Проверка общего секрета ---
    if (SHARED_SECRET) {
      if (payload.secret !== SHARED_SECRET) {
        return jsonOut(403, { ok: false, error: 'Invalid shared secret' });
      }
    }

    // --- Валидация полей ---
    const to = String(payload.to || '').trim();
    const subject = String(payload.subject || '').trim();
    const htmlBody = String(payload.htmlBody || '');

    if (!to || !subject || !htmlBody) {
      return jsonOut(400, {
        ok: false,
        error: 'Missing required field(s): to, subject, htmlBody',
      });
    }

    if (!isValidEmail(to)) {
      return jsonOut(400, { ok: false, error: 'Invalid recipient: ' + to });
    }

    if (htmlBody.length > MAX_BODY_BYTES) {
      return jsonOut(413, {
        ok: false,
        error: 'htmlBody too large (' + htmlBody.length + ' > ' + MAX_BODY_BYTES + ')',
      });
    }

    if (ALLOWED_RECIPIENTS.length && ALLOWED_RECIPIENTS.indexOf(to) === -1) {
      return jsonOut(403, {
        ok: false,
        error: 'Recipient not in allowlist: ' + to,
      });
    }

    // --- Отправка письма через GmailApp ---
    // Используем plain-text fallback на случай, если почтовый клиент получателя
    // не отображает HTML. GAS автоматически сгенерирует multipart/alternative.
    const plainText = htmlToPlainText(htmlBody);

    const messageId = GmailApp.sendEmail(to, subject, plainText, {
      htmlBody: htmlBody,
      // name: 'Цифровой обходной лист',  // имя отправителя (по умолчанию ваше)
      // replyTo: 'no-reply@yourdomain.com', // при необходимости
    });

    return jsonOut(200, {
      ok: true,
      messageId: messageId,
      to: to,
    });
  } catch (err) {
    // Любая неожиданная ошибка — возвращаем 500 с понятным сообщением
    return jsonOut(500, {
      ok: false,
      error: String(err && err.message ? err.message : err),
      stack: err && err.stack ? String(err.stack) : undefined,
    });
  }
}

/**
 * GET — возвращает простую проверку здоровья, чтобы можно было открыть URL
 * в браузере и убедиться, что приложение опубликовано.
 */
function doGet() {
  return jsonOut(200, {
    ok: true,
    service: 'routing-sheet-email-gateway',
    timestamp: new Date().toISOString(),
    secretRequired: Boolean(SHARED_SECRET),
    allowlistActive: ALLOWED_RECIPIENTS.length > 0,
  });
}

/** Утилита: простая проверка формата email. */
function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Утилита: HTML → plain text для fallback'а. Очень грубая —够 для писем. */
function htmlToPlainText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Утилита: возвращает JSON-ответ с правильными заголовками. */
function jsonOut(statusCode, obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

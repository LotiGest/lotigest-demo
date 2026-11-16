export function reminderMatches(kind, due, today, settings) {
  const days = (Date.parse(today + 'T00:00:00Z') - Date.parse(due + 'T00:00:00Z')) / 86400000;
  return kind === 'before' ? days === -settings.before : days === settings.after;
}

export function whatsappPhone(value) {
  const raw = String(value ?? '').trim();
  if (!/^\+?[0-9() -]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+') && /^[2389]\d{7}$/.test(digits)) return '504' + digits;
  return (raw.startsWith('+') || digits.startsWith('504')) && /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function createWhatsAppSender(env = process.env, send = fetch) {
  const { LOTIGEST_WA_TOKEN: token, LOTIGEST_WA_PHONE_ID: id, LOTIGEST_WA_API_VERSION: version,
    LOTIGEST_WA_BEFORE_TEMPLATE: before, LOTIGEST_WA_AFTER_TEMPLATE: after,
    LOTIGEST_WA_LANGUAGE: language = 'es' } = env;
  if (![token,id,version,before,after].some(Boolean)) return null;
  if (!token || !/^\d+$/.test(id) || !/^v\d+\.\d+$/.test(version) ||
      !/^[a-z0-9_]+$/.test(before) || !/^[a-z0-9_]+$/.test(after) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)) {
    throw new Error('Revisa la configuración de WhatsApp Business.');
  }
  const templates = { before, after };
  return async reminder => {
    const response = await send('https://graph.facebook.com/' + version + '/' + id + '/messages', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: reminder.phone, type: 'template',
        template: { name: templates[reminder.kind], language: { code: language },
          components: [{ type: 'body', parameters: [{ type: 'text', text: reminder.due }] }] } }),
    });
    if (!response.ok) throw new Error('WhatsApp rechazó la solicitud: HTTP ' + response.status);
    const data = await response.json();
    if (!data.messages?.[0]?.id) throw new Error('WhatsApp no devolvió una confirmación.');
  };
}

export async function dispatchReminders(store, send) {
  for (const reminder of store.reminderCandidates().slice(0, 100)) {
    if (!store.claimReminder(reminder)) continue;
    try {
      await send(reminder);
    } catch {
      store.finishReminder(reminder, 'review');
      continue;
    }
    store.finishReminder(reminder, 'accepted');
  }
}

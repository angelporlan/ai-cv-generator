const {
  DEFAULT_MODEL,
  MODEL_FALLBACKS,
  OPENROUTER_URL,
  REQUEST_TIMEOUT_MS
} = require('../config');

function getTextFromOpenRouter(data) {
  return data?.choices?.[0]?.message?.content ?? '';
}

function formatOpenRouterError(data, statusCode) {
  const message = data?.error?.message || `OpenRouter failed: ${statusCode}`;
  const raw = data?.error?.metadata?.raw;

  if (raw && raw !== message) {
    return {
      message,
      metadata: { raw }
    };
  }

  return { message };
}

function stripMarkdownFences(text) {
  if (typeof text !== 'string') {
    return '';
  }

  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function buildAiActionMessages(action, cvMarkdown, userInput) {
  let systemMsg = '';
  let userMsg = '';

  switch (action) {
    case 'skill_gap':
      systemMsg = 'Eres un experto en reclutamiento tecnico y recursos humanos. Tu tarea es analizar un CV contra una oferta laboral y proporcionar un analisis de "Skill Gap". Devuelve el reporte en formato Markdown puro sin explicaciones adicionales fuera del reporte. No uses bloques de codigo.';
      userMsg = [
        'Realiza un analisis de "Skill Gap" entre mi CV y la oferta laboral.',
        'Proporciona:',
        '1. Un "Score de Compatibilidad" (%).',
        '2. Fortalezas (que cumplo).',
        '3. Brechas (que falta o no esta claro).',
        '4. Sugerencias de palabras clave a incluir en mi CV.',
        '',
        'Oferta laboral:',
        '---',
        userInput,
        '---',
        '',
        'CV original:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n');
      break;

    case 'cover_letter':
      systemMsg = 'Eres un redactor experto en carreras profesionales. Escribe cartas de presentacion persuasivas, profesionales y modernas. Devuelve solo el texto de la carta en formato Markdown puro, sin explicaciones ni bloques de codigo.';
      userMsg = [
        'Escribe una carta de presentacion basada en mi CV para aplicar a la siguiente oferta.',
        'La carta debe ser persuasiva, destacar mis fortalezas relevantes para la oferta y mantener un tono profesional en espanol.',
        'Estructura la carta en Markdown.',
        '',
        'Oferta laboral:',
        '---',
        userInput,
        '---',
        '',
        'Mi CV:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n');
      break;

    case 'optimize_star':
      systemMsg = 'Eres un experto en curriculums y optimizacion de logros. Tu tarea es reescribir la seccion de "Experiencia" del CV usando la metodologia STAR. Manten el resto del formato Markdown intacto. Devuelve solo el Markdown completo resultante, sin explicaciones ni bloques de codigo.';
      userMsg = [
        'Reescribe las vietas de experiencia de mi CV aplicando el metodo STAR para maximizar el impacto.',
        'Manten la estructura Markdown intacta. No modifiques la educacion ni los datos personales.',
        '',
        'Oferta laboral o notas adicionales (si las hay):',
        '---',
        userInput,
        '---',
        '',
        'Mi CV:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n');
      break;

    case 'translate':
      systemMsg = 'Eres un traductor profesional experto en curriculums tecnicos. Traduce el documento manteniendo intacta la estructura Markdown original, los encabezados y la semantica tecnica. Devuelve solo el Markdown resultante, sin explicaciones ni bloques de codigo.';
      userMsg = [
        `Traduce el siguiente CV al idioma: ${userInput || 'Ingles'}.`,
        'Manten todos los caracteres especiales, iconos y estructura Markdown original.',
        '',
        'CV original:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n');
      break;

    case 'adapt':
    default:
      systemMsg = [
        'Eres un experto en reclutamiento tecnico y optimizacion ATS.',
        'Adapta el CV del candidato a la oferta sin inventar experiencia no respaldada.',
        'Manten formato markdown limpio para este editor de CV.',
        'Devuelve solo markdown del CV, sin explicaciones ni bloques de codigo.'
      ].join(' ');
      userMsg = [
        'Adapta y optimiza este CV para la oferta laboral.',
        'Objetivos:',
        '- Reforzar palabras clave ATS relevantes de la oferta.',
        '- Priorizar logros e impacto cuantificable.',
        '- Mantener redaccion clara y profesional en espanol.',
        '- Conservar estructura markdown compatible con CV Studio.',
        '- No agregar datos falsos.',
        '',
        'Oferta laboral:',
        '---',
        userInput,
        '---',
        '',
        'CV original:',
        '---',
        cvMarkdown,
        '---'
      ].join('\n');
      break;
  }

  return [
    { role: 'system', content: systemMsg },
    { role: 'user', content: userMsg }
  ];
}

function buildLinkedInImportMessages(linkedInText) {
  return [
    {
      role: 'system',
      content: [
        'Eres un experto en redaccion de curriculums tecnicos y parseo de datos estructurados.',
        'Toma el texto pegado desde un perfil de LinkedIn y conviertelo a un formato Markdown limpio y profesional.',
        'Sigue la estructura estandar de CV: nombre, titulo, informacion de contacto, resumen, experiencia, educacion y habilidades.',
        'Devuelve solo el markdown del CV, sin explicaciones ni bloques de codigo.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        'Convierte este texto bruto de LinkedIn a un curriculum en formato Markdown estructurado.',
        'Objetivos:',
        '- Extraer nombre, cargo y datos de contacto.',
        '- Estructurar la experiencia profesional con cargos, empresas, fechas y descripciones concisas.',
        '- Estructurar educacion y proyectos si los hay.',
        '- Estructurar habilidades.',
        '- Eliminar texto irrelevante generado por la UI de LinkedIn.',
        '- Mantener un tono profesional en espanol.',
        '',
        'Texto de LinkedIn:',
        '---',
        linkedInText,
        '---'
      ].join('\n')
    }
  ];
}

function shouldRetryWithFallback(errorMessage) {
  const normalized = String(errorMessage || '').toLowerCase();
  return normalized.includes('no endpoints found')
    || normalized.includes('model not found')
    || normalized.includes('timeout');
}

async function callOpenRouter(token, model, messages) {
  try {
    const openRouterResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost:3002',
        'X-Title': 'CV Optimizer'
      },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    console.log(`[OpenRouter] Status: ${openRouterResponse.status}`);
    const data = await openRouterResponse.json();

    if (!openRouterResponse.ok) {
      console.error('[OpenRouter API Error]', JSON.stringify(data, null, 2));
      const errorInfo = formatOpenRouterError(data, openRouterResponse.status);
      const error = new Error(errorInfo.message);
      error.metadata = errorInfo.metadata;
      throw error;
    }

    return getTextFromOpenRouter(data);
  } catch (error) {
    if (error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('timed out')) {
      const timeoutError = new Error(`OpenRouter request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      timeoutError.metadata = {
        raw: `The operation was aborted due to timeout after ${REQUEST_TIMEOUT_MS}ms while calling ${model}`
      };
      console.error('[OpenRouter TIMEOUT]', timeoutError.metadata.raw);
      throw timeoutError;
    }

    console.error('[OpenRouter EXCEPTION]', error.message);
    throw error;
  }
}

async function callOpenRouterWithFallback(token, preferredModel, messages) {
  const modelCandidates = [...new Set([preferredModel, ...MODEL_FALLBACKS].filter(Boolean))];
  let lastError = null;

  for (const candidateModel of modelCandidates) {
    try {
      const responseText = await callOpenRouter(token, candidateModel, messages);
      return { responseText, usedModel: candidateModel };
    } catch (error) {
      lastError = error;
      if (!shouldRetryWithFallback(error?.message)) {
        throw error;
      }
      console.warn(`[OpenRouter] Model unavailable, trying fallback: ${candidateModel}`);
    }
  }

  throw lastError || new Error('No available model found in fallback list');
}

async function askOpenRouter(token, model = DEFAULT_MODEL, prompt = 'Hello') {
  return callOpenRouter(token, model, [{ role: 'user', content: prompt }]);
}

module.exports = {
  askOpenRouter,
  buildAiActionMessages,
  buildLinkedInImportMessages,
  callOpenRouterWithFallback,
  stripMarkdownFences
};

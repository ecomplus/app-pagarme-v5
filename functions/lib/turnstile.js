const axios = require('axios')
const { logger } = require('../context')

// Barreira contra teste de cartão (card testing) com o Cloudflare Turnstile.
// O navegador obtém o token do Turnstile ao gerar o hash do cartão
// (`assets/onload-expression.js`) e o manda junto com o hash, num JSON em base64.
// O `create_transaction` confere o token aqui, antes de o cartão chegar ao Pagar.me.
// O token só vale uma vez: cada desafio resolvido rende uma única tentativa de cartão.
// Só liga para a loja que preencher as duas chaves do Turnstile no app.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
// Mesma ação com que o widget é renderizado no navegador
const ACTION = 'checkout'
const VERIFY_TIMEOUT_MS = 5000
const MAX_TOKEN_LENGTH = 2048
// Erros de configuração ou do próprio Turnstile não podem derrubar as vendas
const FAIL_OPEN_CODES = ['missing-input-secret', 'invalid-input-secret', 'internal-error']
// Formas de pagamento que não passam pelo cartão. Qualquer outro código vira
// cartão no Pagar.me (`paymentMethods[code] || 'credit_card'`), então a barreira
// vale para tudo que não estiver aqui, e não só para `credit_card`
const NON_CARD_METHODS = ['banking_billet', 'account_deposit']

const hasValue = value => typeof value === 'string' && value.trim() !== ''

// Sem as duas chaves a verificação fica desligada: exigir o token sem a chave
// do site no navegador recusaria todo pagamento com cartão
const getTurnstileMode = (appData) => {
  if (!hasValue(appData.turnstile_site_key) || !hasValue(appData.turnstile_secret_key)) {
    return 'off'
  }
  const mode = appData.turnstile_mode
  return mode === 'off' || mode === 'enforce' ? mode : 'report'
}

// Variáveis lidas pelo `assets/onload-expression.js`, vazio com a verificação desligada
const getTurnstileClientConfig = (appData) => {
  const mode = getTurnstileMode(appData)
  if (mode === 'off') return ''
  return `window._pagarmeTurnstileKey=${JSON.stringify(appData.turnstile_site_key.trim())};` +
    `window._pagarmeTurnstileMode=${JSON.stringify(mode)};`
}

// Separa o token do Turnstile do hash do cartão. O navegador manda
// base64(JSON `{ hash, turnstile }`); um hash comum (token do Pagar.me) segue como veio
const unwrapCardHash = (hash) => {
  if (!hasValue(hash)) return { hash }
  try {
    const decoded = JSON.parse(Buffer.from(hash, 'base64').toString('utf8'))
    if (decoded && typeof decoded.hash === 'string') {
      return { hash: decoded.hash, turnstileToken: decoded.turnstile }
    }
  } catch (e) {
    // hash comum, sem envelope
  }
  return { hash }
}

// Devolve `null` quando o pagamento pode seguir, senão `{ reason, detail }`
const verifyTurnstileToken = async (secret, token, logData) => {
  if (!token) return { reason: 'turnstile-missing' }
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    return { reason: 'turnstile-invalid' }
  }
  let result
  try {
    const { data } = await axios.post(
      VERIFY_URL,
      new URLSearchParams({ secret, response: token }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: VERIFY_TIMEOUT_MS
      }
    )
    if (!data || typeof data !== 'object') {
      throw new Error('Unexpected siteverify response')
    }
    result = data
  } catch (err) {
    // Mesmo prefixo das recusas: liberar sem conferir tem de aparecer na mesma busca
    logger.warn('Turnstile guard: unavailable, allowing payment', { ...logData, message: err.message })
    return null
  }
  const errorCodes = result['error-codes'] || []
  if (!result.success) {
    if (errorCodes.some(code => FAIL_OPEN_CODES.includes(code))) {
      logger.error('Turnstile guard: misconfigured, allowing payment', { ...logData, errorCodes })
      return null
    }
    return { reason: 'turnstile-invalid', detail: { errorCodes } }
  }
  // Token válido, mas emitido por outra página com o mesmo widget
  if (result.action !== ACTION) {
    return { reason: 'turnstile-invalid', detail: { action: result.action, hostname: result.hostname } }
  }
  return null
}

// Confere a verificação anti-robô de um `create_transaction`. Devolve a recusa
// só quando o pagamento deve ser barrado; no modo `report` ela é só registrada
const checkTurnstile = async ({ appData, params, turnstileToken, storeId }) => {
  const mode = getTurnstileMode(appData)
  const paymentMethod = params.payment_method && params.payment_method.code
  if (mode === 'off' || NON_CARD_METHODS.includes(paymentMethod)) return null
  const logData = {
    storeId,
    orderId: params.order_id,
    mode,
    paymentMethod,
    browserIp: params.browser_ip
  }
  let refusal
  try {
    refusal = await verifyTurnstileToken(appData.turnstile_secret_key.trim(), turnstileToken, logData)
  } catch (err) {
    // Falha fechada: um erro provocado pela requisição não pode abrir a barreira
    logger.error('Turnstile guard failed', { ...logData, message: err.message })
    refusal = { reason: 'guard-error' }
  }
  if (!refusal) return null
  logger.warn(`Turnstile guard: ${refusal.reason}`, { ...logData, ...refusal.detail })
  return mode === 'enforce' ? refusal : null
}

module.exports = {
  getTurnstileMode,
  getTurnstileClientConfig,
  unwrapCardHash,
  verifyTurnstileToken,
  checkTurnstile
}

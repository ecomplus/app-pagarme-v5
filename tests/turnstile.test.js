const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const vm = require('node:vm')

const functionsDir = path.resolve(__dirname, '../functions')
// Mesma instância do axios que `functions/lib/turnstile.js` carrega
const axios = require(path.join(functionsDir, 'node_modules/axios'))
const { logger } = require(path.join(functionsDir, 'context'))
const {
  getTurnstileMode,
  getTurnstileClientConfig,
  unwrapCardHash,
  checkTurnstile
} = require(path.join(functionsDir, 'lib/turnstile'))

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

let logs
let siteverifyCalls
let siteverifyResponse
beforeEach(() => {
  logs = []
  ;['info', 'warn', 'error'].forEach(level => {
    logger[level] = (msg, data) => logs.push({ level, msg, data })
  })
  siteverifyCalls = []
  siteverifyResponse = () => ({ data: { success: true, action: 'checkout', hostname: 'www.loja.com.br' } })
  axios.post = async (url, body, options) => {
    siteverifyCalls.push({ url, body: new URLSearchParams(body), options })
    return siteverifyResponse()
  }
})

const appData = (mode = 'enforce') => ({
  turnstile_mode: mode,
  turnstile_site_key: '0x4AAAAAAA-site',
  turnstile_secret_key: '0x4AAAAAAA-secret'
})
const cardParams = (code = 'credit_card') => ({
  order_id: '6560000000000000000000aa',
  payment_method: { code },
  browser_ip: '203.0.113.9'
})
const wrapHash = (hash, turnstile) => Buffer.from(JSON.stringify({ hash, turnstile })).toString('base64')

test('verificação desligada sem as duas chaves', () => {
  assert.equal(getTurnstileMode({}), 'off')
  assert.equal(getTurnstileMode({ turnstile_mode: 'enforce', turnstile_secret_key: 'x' }), 'off')
  assert.equal(getTurnstileMode({ turnstile_mode: 'enforce', turnstile_site_key: 'x' }), 'off')
  assert.equal(getTurnstileMode({ ...appData(), turnstile_site_key: '  ' }), 'off')
})

test('modo padrão é só observar', () => {
  assert.equal(getTurnstileMode({ ...appData(), turnstile_mode: undefined }), 'report')
  assert.equal(getTurnstileMode({ ...appData(), turnstile_mode: 'qualquer' }), 'report')
  assert.equal(getTurnstileMode(appData('enforce')), 'enforce')
  assert.equal(getTurnstileMode(appData('off')), 'off')
})

test('config do navegador só sai com a verificação ligada e com valores escapados', () => {
  assert.equal(getTurnstileClientConfig({}), '')
  assert.equal(getTurnstileClientConfig(appData('off')), '')
  const config = getTurnstileClientConfig({ ...appData('report'), turnstile_site_key: ' a";alert(1);" ' })
  const sandbox = { window: {} }
  vm.runInNewContext(config, sandbox)
  assert.equal(sandbox.window._pagarmeTurnstileKey, 'a";alert(1);"')
  assert.equal(sandbox.window._pagarmeTurnstileMode, 'report')
})

test('hash comum do Pagar.me passa sem mudança', () => {
  assert.deepEqual(unwrapCardHash('token_AbCdEf0123456789'), { hash: 'token_AbCdEf0123456789' })
  assert.deepEqual(unwrapCardHash(''), { hash: '' })
  assert.deepEqual(unwrapCardHash(undefined), { hash: undefined })
})

test('envelope separa o hash do token do Turnstile', () => {
  assert.deepEqual(
    unwrapCardHash(wrapHash('token_AbC', 'turnstile-token')),
    { hash: 'token_AbC', turnstileToken: 'turnstile-token' }
  )
  // Envelope sem `hash` em texto não é envelope
  const fake = Buffer.from(JSON.stringify({ hash: { x: 1 }, turnstile: 't' })).toString('base64')
  assert.deepEqual(unwrapCardHash(fake), { hash: fake })
})

test('desligada ou boleto/Pix não consultam o Turnstile', async () => {
  assert.equal(await checkTurnstile({ appData: appData('off'), params: cardParams() }), null)
  assert.equal(await checkTurnstile({ appData: {}, params: cardParams() }), null)
  assert.equal(await checkTurnstile({ appData: appData(), params: cardParams('banking_billet') }), null)
  assert.equal(await checkTurnstile({ appData: appData(), params: cardParams('account_deposit') }), null)
  assert.equal(siteverifyCalls.length, 0)
  assert.equal(logs.length, 0)
})

test('código de pagamento desconhecido também exige o token, porque vira cartão', async () => {
  const refusal = await checkTurnstile({ appData: appData(), params: cardParams('loyalty_points'), storeId: 1 })
  assert.equal(refusal.reason, 'turnstile-missing')
})

test('sem token: recusa no enforce e só registra no report', async () => {
  const refusal = await checkTurnstile({ appData: appData('enforce'), params: cardParams(), storeId: 1 })
  assert.equal(refusal.reason, 'turnstile-missing')
  assert.equal(await checkTurnstile({ appData: appData('report'), params: cardParams(), storeId: 1 }), null)
  assert.equal(siteverifyCalls.length, 0)
  const warnings = logs.filter(({ msg }) => msg === 'Turnstile guard: turnstile-missing')
  assert.deepEqual(warnings.map(({ data }) => data.mode), ['enforce', 'report'])
  assert.equal(warnings[0].data.storeId, 1)
  assert.equal(warnings[0].data.browserIp, '203.0.113.9')
})

test('token válido libera e é conferido com a chave secreta', async () => {
  const refusal = await checkTurnstile({
    appData: appData(),
    params: cardParams(),
    turnstileToken: 'token-ok',
    storeId: 1
  })
  assert.equal(refusal, null)
  assert.equal(siteverifyCalls.length, 1)
  assert.equal(siteverifyCalls[0].url, SITEVERIFY)
  assert.equal(siteverifyCalls[0].body.get('secret'), '0x4AAAAAAA-secret')
  assert.equal(siteverifyCalls[0].body.get('response'), 'token-ok')
  assert.ok(siteverifyCalls[0].options.timeout > 0)
})

test('token recusado pela Cloudflare (inválido ou já usado) barra o cartão', async () => {
  siteverifyResponse = () => ({ data: { success: false, 'error-codes': ['timeout-or-duplicate'] } })
  const refusal = await checkTurnstile({ appData: appData(), params: cardParams(), turnstileToken: 't' })
  assert.equal(refusal.reason, 'turnstile-invalid')
  assert.deepEqual(refusal.detail.errorCodes, ['timeout-or-duplicate'])
})

test('token de outra ação do mesmo widget barra o cartão', async () => {
  siteverifyResponse = () => ({ data: { success: true, action: 'login', hostname: 'www.loja.com.br' } })
  const refusal = await checkTurnstile({ appData: appData(), params: cardParams(), turnstileToken: 't' })
  assert.equal(refusal.reason, 'turnstile-invalid')
})

test('token grande demais é recusado sem consultar a Cloudflare', async () => {
  const refusal = await checkTurnstile({
    appData: appData(),
    params: cardParams(),
    turnstileToken: 'x'.repeat(2049)
  })
  assert.equal(refusal.reason, 'turnstile-invalid')
  assert.equal(siteverifyCalls.length, 0)
})

test('chave secreta errada ou Cloudflare fora do ar não derrubam as vendas', async () => {
  siteverifyResponse = () => ({ data: { success: false, 'error-codes': ['invalid-input-secret'] } })
  assert.equal(await checkTurnstile({ appData: appData(), params: cardParams(), turnstileToken: 't' }), null)
  assert.ok(logs.some(({ level, msg }) => level === 'error' && msg.startsWith('Turnstile guard: misconfigured')))

  siteverifyResponse = () => { throw new Error('timeout of 5000ms exceeded') }
  assert.equal(await checkTurnstile({ appData: appData(), params: cardParams(), turnstileToken: 't' }), null)
  siteverifyResponse = () => ({ data: '<html>erro</html>' })
  assert.equal(await checkTurnstile({ appData: appData(), params: cardParams(), turnstileToken: 't' }), null)
  assert.equal(logs.filter(({ msg }) => msg.startsWith('Turnstile guard: unavailable')).length, 2)
})

// `create_transaction` de ponta a ponta, com o Pagar.me simulado
const createPaymentCalls = []
const paymentSubscriptionsPath = path.join(functionsDir, 'lib/pagarme/payment-subscriptions.js')
require.cache[paymentSubscriptionsPath] = {
  id: paymentSubscriptionsPath,
  filename: paymentSubscriptionsPath,
  loaded: true,
  exports: {
    createSubscription: async () => { throw new Error('não esperado') },
    createPayment: async (args) => {
      createPaymentCalls.push(args)
      return {
        data: {
          id: 'or_123',
          charges: [{
            status: 'paid',
            created_at: '2026-11-26T12:00:00Z',
            last_transaction: { acquirer_auth_code: '123', acquirer_tid: '456' }
          }]
        }
      }
    }
  }
}
const createTransaction = require(path.join(functionsDir, 'routes/ecom/modules/create-transaction'))

const callCreateTransaction = async (data, hash) => {
  const res = {
    statusCode: 200,
    status (code) { this.statusCode = code; return this },
    send (body) { this.body = body; return this }
  }
  const req = {
    storeId: 1,
    body: {
      application: { data, hidden_data: {} },
      params: {
        ...cardParams(),
        type: 'payment',
        order_number: 1001,
        amount: { total: 100 },
        installments_number: 1,
        credit_card: { holder_name: 'Fulano', hash },
        buyer: {
          fullname: 'Fulano de Tal',
          email: 'fulano@example.com',
          doc_number: '12345678909',
          phone: { number: '31999999999' }
        }
      }
    }
  }
  await createTransaction.post({ appSdk: {}, admin: { firestore: () => ({ collection: () => ({}) }) } }, req, res)
  return res
}

test('create_transaction recusa sem token no enforce antes de chamar o Pagar.me', async () => {
  createPaymentCalls.length = 0
  const res = await callCreateTransaction(appData('enforce'), 'token_card')
  assert.equal(res.statusCode, 409)
  assert.equal(res.body.error, 'PAGARME_TURNSTILE_ERR')
  assert.equal(createPaymentCalls.length, 0)
})

test('create_transaction manda ao Pagar.me o hash sem o envelope', async () => {
  createPaymentCalls.length = 0
  const res = await callCreateTransaction(appData('enforce'), wrapHash('token_card', 'token-ok'))
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.transaction.status.current, 'paid')
  assert.equal(createPaymentCalls.length, 1)
  assert.equal(createPaymentCalls[0].params.credit_card.hash, 'token_card')
  assert.equal(siteverifyCalls[0].body.get('response'), 'token-ok')
})

test('create_transaction segue sem token no report e em loja sem as chaves', async () => {
  createPaymentCalls.length = 0
  assert.equal((await callCreateTransaction(appData('report'), 'token_card')).statusCode, 200)
  assert.equal((await callCreateTransaction({}, 'token_card')).statusCode, 200)
  assert.deepEqual(createPaymentCalls.map(({ params }) => params.credit_card.hash), ['token_card', 'token_card'])
  assert.equal(siteverifyCalls.length, 0)
})

// O script minificado é o que todas as lojas com Pagar.me v5 recebem: sem a chave
// do Turnstile ele tem de se comportar como antes
const minifiedPath = path.join(functionsDir, 'assets/dist/onload-expression.min.js')

test('script do navegador sem Turnstile devolve o token do Pagar.me como antes', async (t) => {
  if (!fs.existsSync(minifiedPath)) return t.skip('rode scripts/scripts-minification.js antes')
  const fetchCalls = []
  const window = { _pagarmeKey: 'pk_test_123' }
  const sandbox = {
    window,
    console: { log () {}, error () {} },
    fetch: async (url, options) => {
      fetchCalls.push({ url, body: JSON.parse(options.body) })
      return { json: async () => ({ id: 'token_card' }) }
    }
  }
  vm.runInNewContext(fs.readFileSync(minifiedPath, 'utf8'), sandbox)
  const hash = await window._pagarmeHash({ number: '4111111111111111', name: 'F', month: '12', year: '30', cvc: '123' })
  assert.equal(hash, 'token_card')
  assert.equal(fetchCalls[0].url, 'https://api.pagar.me/core/v5/tokens?appId=pk_test_123')
  assert.equal(fetchCalls[0].body.card.number, '4111111111111111')
  assert.equal(window._pagarmeTurnstile, undefined)

  sandbox.fetch = async () => ({ json: async () => ({ errors: {} }) })
  await assert.rejects(window._pagarmeHash({}), /Credencial inválida/)
})

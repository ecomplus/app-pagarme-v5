const { hostingUri } = require('../../../__env')
const path = require('path')
const fs = require('fs')
const addInstallments = require('../../../lib/payments/add-installments')
const { discountPlanPayment } = require('../../../lib/pagarme/handle-plans')
const ecomClient = require('@ecomplus/client')

exports.post = async ({ appSdk }, req, res) => {
  // https://apx-mods.e-com.plus/api/v1/list_payments/schema.json?store_id=100
  const { params, application } = req.body
  const { storeId } = req

  const { items } = params

  const configApp = Object.assign({}, application.data, application.hidden_data)

  const categoryIds = configApp.recurrency_category_ids
  let hasRecurrence = false
  let isAllRecurring = true

  if (categoryIds && categoryIds.length) {
    try {
      const { data } = await ecomClient.search({
        storeId,
        url: '/items.json',
        method: 'post',
        data: {
          size: items.length,
          query: {
            bool: {
              must: [
                { terms: { '_id': items.map((item) => item.product_id) } },
                { terms: { 'categories._id': categoryIds } },
              ]
            }
          }
        }
      })

      hasRecurrence = data?.hits.total > 0
      isAllRecurring = data?.hits.total === items.length

      // console.log(`${JSON.stringify(data?.hits.total)} isAllRecurring: ${isAllRecurring} hasRecurrence: ${hasRecurrence}`)

    } catch (err) {
      // console.error(err)
    }
  }

  if (!configApp.pagarme_api_token || !configApp.pagarme_public_key) {
    return res.status(409).send({
      error: 'NO_PAGARME_KEYS',
      message: 'Chave de API e/ou criptografia não configurada (lojista deve configurar o aplicativo)'
    })
  }

  // https://apx-mods.e-com.plus/api/v1/list_payments/response_schema.json?store_id=100
  const response = {
    payment_gateways: []
  }

  const paymentTypes = []
  if (configApp.recurrence && configApp.recurrence.length && configApp.recurrence[0].label && isAllRecurring) {
    paymentTypes.push('recurrence')
  }

  if ((!hasRecurrence) && (!configApp.credit_card.disable || !configApp.banking_billet.disable || !configApp.account_deposit.disable)) {
    paymentTypes.push('payment')
  }

  // setup payment gateway objects
  const intermediator = {
    name: 'Pagar.me',
    link: 'https://pagar.me/',
    code: 'pagarme'
  }

  const listPaymentMethod = ['credit_card', 'banking_billet']

  if (!configApp.account_deposit?.disable) {
    listPaymentMethod.push('account_deposit')
  }

  // console.log(`APP: ${JSON.stringify(configApp)}`)
  paymentTypes.forEach(type => {
    // At first the occurrence only with credit card
    const isRecurrence = type === 'recurrence'
    const plans = isRecurrence ? configApp.recurrence : ['single_payment']
    plans.forEach(plan => {
      listPaymentMethod.forEach(paymentMethod => {
        const amount = { ...params.amount } || {}
        const isCreditCard = paymentMethod === 'credit_card'
        const isPix = paymentMethod === 'account_deposit'
        const methodConfig = configApp[paymentMethod] || {}
        let methodEnable = !methodConfig.disable

        if (methodEnable && isRecurrence) {
          methodEnable = methodConfig.enable_recurrence
        }

        // console.log(`>>list: #${storeId} ${type} - ${paymentMethod} - ${methodEnable}  plan: ${JSON.stringify(plan)}`)

        // Pix not active in recurrence
        methodEnable = isPix && isRecurrence ? false : methodEnable

        const minAmount = (isRecurrence ? plan?.min_amount : methodConfig?.min_amount) || 0

        const validateAmount = amount.subtotal ? (amount.subtotal >= minAmount) : true // Workaround for showcase
        if (methodEnable && validateAmount) {
          let label = isRecurrence ? plan.label : methodConfig.label
          if (!label) {
            if (isCreditCard) {
              label = 'Cartão de crédito'
            } else {
              label = !isPix ? 'Boleto bancário' : 'Pix'
            }
          }
          const gateway = {
            label,
            icon: methodConfig.icon,
            payment_method: {
              code: paymentMethod,
              name: `${isRecurrence ? `Assinatura ${plan.periodicity} ` : ''}` +
                `${label} - ${intermediator.name}`
            },
            type,
            intermediator
          }

          if (!isRecurrence && methodConfig.text) {
            gateway.text = methodConfig.text
          }

          let discount
          if (isRecurrence) {
            discount = discountPlanPayment(label, plan, amount)
          } else {
            discount = configApp.discount
          }

          if (discount) {
            if (isRecurrence) {
              if (plan.discount_first_installment &&
                plan.discount_first_installment.value
              ) {
                gateway.discount = plan.discount_first_installment
              } else {
                gateway.discount = plan.discount
              }

              gateway.discount.type = discount.discountOption.type
              // response.discount_option = discount.discountOption
            } else if (discount[paymentMethod]) {
              gateway.discount = {
                apply_at: discount.apply_at,
                type: discount.type,
                value: discount.value
              }

              // check amount value to apply discount
              if (amount.total < (discount.min_amount || 0)) {
                delete gateway.discount
              } else {
                delete discount.min_amount

                // fix local amount object
                const applyDiscount = discount.apply_at

                const maxDiscount = amount[applyDiscount || 'subtotal']
                let discountValue
                if (discount.type === 'percentage') {
                  discountValue = maxDiscount * discount.value / 100
                } else {
                  discountValue = discount.value
                  if (discountValue > maxDiscount) {
                    discountValue = maxDiscount
                  }
                }

                if (discountValue) {
                  amount.discount = (amount.discount || 0) + discountValue
                  amount.total -= discountValue
                  if (amount.total < 0) {
                    amount.total = 0
                  }
                }
              }
              if (response.discount_option) {
                response.discount_option.min_amount = discount.min_amount
              }
            }
          }

          if (isCreditCard) {
            if (!gateway.icon) {
              gateway.icon = `${hostingUri}/credit-card.png`
            }
            // https://github.com/pagarme/pagarme-js
            gateway.js_client = {
              script_uri: 'https://checkout.pagar.me/v1/tokenizecard.js',
              onload_expression: `window._pagarmeKey="${configApp.pagarme_public_key}";` +
                fs.readFileSync(path.join(__dirname, '../../../assets/dist/onload-expression.min.js'), 'utf8'),
              cc_hash: {
                function: '_pagarmeHash',
                is_promise: true
              }
            }
            if (!isRecurrence) {
              const { installments } = configApp
              if (installments) {
                // list all installment options and default one
                addInstallments(amount, installments, gateway, response)
              }
            }
          }
          response.payment_gateways.push(gateway)
        }
      })
    })
  })

  // console.log(`Response: ${JSON.stringify(response?.payment_gateways)}`)
  res.send(response)
}

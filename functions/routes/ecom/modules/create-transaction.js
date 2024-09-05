const { createSubscription, createPayment } = require('../../../lib/pagarme/payment-subscriptions')
const { getPlanInTransction } = require('../../../lib/pagarme/handle-plans')
const { parserInvoiceStatusToEcom, parseAddress } = require('../../../lib/pagarme/parses-utils')
const axios = require('../../../lib/pagarme/axios-create')
const { logger } = require('../../../context')

exports.post = async ({ appSdk, admin }, req, res) => {
  const colletionFirebase = admin.firestore().collection('subscriptions')

  const { params, application } = req.body
  const { storeId } = req
  const appData = Object.assign({}, application.data, application.hidden_data)

  const pagarmeAxios = axios(appData.pagarme_api_token)

  const orderId = params.order_id
  // const { amount, buyer, payer, to, items } = params
  const { amount, to, buyer } = params
  logger.info(`> Transaction s${storeId}, #${orderId} => ${params.type}`)
  const paymentMethod = params.payment_method.code

  // https://apx-mods.e-com.plus/api/v1/create_transaction/response_schema.json?store_id=100
  const transaction = {
    amount: amount.total
  }

  const isRecurrence = params.type === 'recurrence'
  let subscriptionPagarmeId
  let address

  if (to && to.street) {
    address = parseAddress(to)
  } else if (params.billing_address) {
    address = parseAddress(params.billing_address)
  }

  let redirectToPayment = false
  try {
    const pagarMeCustomer = {
      name: buyer.fullname,
      type: buyer.registry_type === 'j' ? 'company' : 'individual',
      email: buyer.email,
      code: buyer.customer_id,
      document: buyer.doc_number,
      document_type: buyer.registry_type === 'j' ? 'cnpj' : 'cpf',
      address,
      phones: {
        [`${buyer.phone.type === 'personal' ? 'mobile_phone' : 'home_phone'}`]: {
          country_code: `${(buyer.phone.country_code || 55)}`,
          area_code: (buyer.phone.number).substring(0, 2),
          number: (buyer.phone.number).substring(2)
        }
      }
    }
    const birthDate = buyer.birth_date
    if (birthDate && birthDate.year && birthDate.day) {
      pagarMeCustomer.birthday = `${birthDate.year}-` +
        `${birthDate.month.toString().padStart(2, '0')}-` +
        birthDate.day.toString().padStart(2, '0')
    }

    if (isRecurrence) {
      const methodConfigName = params.payment_method.code === 'credit_card' ? appData.credit_card.label : appData.banking_billet.label
      let labelPaymentGateway = params.payment_method.name.replace('- Pagar.me', '')
      labelPaymentGateway = labelPaymentGateway.replace(methodConfigName, '')

      const plan = getPlanInTransction(labelPaymentGateway, appData.recurrence)
      const { data: subcription } = await createSubscription(params, appData, storeId, plan, pagarMeCustomer)
      logger.info(`> Response: ${JSON.stringify(subcription)}`)
      subscriptionPagarmeId = subcription.id
      // /invoices
      const { data: { data: invoices } } = await pagarmeAxios.get(`/invoices?subscription_id=${subscriptionPagarmeId}`)

      const { data: charge } = await pagarmeAxios.get(`/charges/${invoices[0].charge.id}`)

      const transactionPagarme = charge.last_transaction

      transaction.status = {
        updated_at: invoices[0].created_at || new Date().toISOString(),
        current: parserInvoiceStatusToEcom(invoices[0].status)
      }

      transaction.intermediator = {
        transaction_id: invoices[0].id,
        transaction_code: `${subcription.id || ''}`,
        transaction_reference: `${transactionPagarme.acquirer_tid || ''}`
      }

      if (paymentMethod === 'banking_billet') {
        transaction.banking_billet = {
          // code: charge.last_transaction.barcode,
          valid_thrud: charge.last_transaction.due_at,
          link: charge.last_transaction.pdf
        }
        transaction.payment_link = charge.last_transaction.url
        redirectToPayment = true
      }

      colletionFirebase.doc(orderId)
        .set({
          storeId,
          status: subcription.status,
          orderNumber: params.order_number,
          created_at: new Date().toISOString(),
          plan,
          subscriptionPagarmeId,
          invoicePagarmeId: invoices[0].id,
          changePagarmeId: charge.id,
          items: subcription.items,
          amount
        })
        .catch(logger.error)

      res.send({
        redirect_to_payment: redirectToPayment,
        transaction
      })
    } else {
      // type payment
      const { data: payment } = await createPayment(params, appData, storeId, pagarMeCustomer)
      logger.info(`> Response: ${JSON.stringify(payment)}`)
      const [charge] = payment.charges

      const transactionPagarme = charge.last_transaction

      transaction.status = {
        updated_at: charge.created_at || new Date().toISOString(),
        current: parserInvoiceStatusToEcom(charge.status)
      }

      transaction.intermediator = {
        transaction_id: payment.id,
        transaction_code: `${transactionPagarme.acquirer_auth_code || ''}`,
        transaction_reference: `${transactionPagarme.acquirer_tid || ''}`
      }

      if (paymentMethod === 'account_deposit') {
        let notes = '<div style="display:block;margin:0 auto"> '
        notes += `<img src="${transactionPagarme.qr_code_url}" style="display:block;margin:0 auto"> `
        // `<input readonly type="text" id="pix-copy" value="${brCode}" />` +
        // `<button type="button" class="btn btn-sm btn-light" onclick="let codePix = document.getElementById('pix-copy')
        // codePix.select() document.execCommand('copy')">Copiar Pix</button>`
        notes += '</div>'
        transaction.notes = notes
        if (transactionPagarme.qr_code) {
          transaction.intermediator.transaction_code = transactionPagarme.qr_code
        }
        if (transactionPagarme.expires_at) {
          transaction.account_deposit = {
            valid_thru: transactionPagarme.expires_at
          }
        }
      } else if (paymentMethod === 'banking_billet') {
        transaction.banking_billet = {
          // code: charge.last_transaction.barcode,
          valid_thrud: charge.last_transaction.due_at,
          link: charge.last_transaction.pdf
        }
        transaction.payment_link = charge.last_transaction.url
        redirectToPayment = true
      }

      res.send({
        redirect_to_payment: redirectToPayment,
        transaction
      })
    }
  } catch (error) {
    logger.error(error)
    // try to debug request error
    const errCode = isRecurrence ? 'PAGARME_SUBSCRIPTION_ERR' : 'PAGARME_TRANSACTION_ERR'
    let { message } = error
    const err = new Error(`${errCode} #${storeId} - ${orderId} => ${message}`)
    if (error.response) {
      const { status, data } = error.response
      if (status !== 401 && status !== 403) {
        // err.payment = JSON.stringify(pagarmeTransaction)
        err.status = status
        if (typeof data === 'object' && data) {
          err.response = JSON.stringify(data)
        } else {
          err.response = data
        }
      } else if (data && Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) {
        message = data.errors[0].message
      }
    }
    logger.warn(err)
    res.status(409)
    res.send({
      error: errCode,
      message
    })
  }
}

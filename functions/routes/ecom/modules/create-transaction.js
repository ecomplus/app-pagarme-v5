const { createSubscription } = require('../../../lib/pagarme/subscriptions')
const { getPlanInTransction } = require('../../../lib/pagarme/handle-plans')
const { parserInvoiceStatusToEcom } = require('../../../lib/pagarme/parse-to-ecom')
const axios = require('../../../lib/pagarme/axios-create')

exports.post = async ({ appSdk, admin }, req, res) => {
  const colletionFirebase = admin.firestore().collection('subscriptions')

  const { params, application } = req.body
  const { storeId } = req
  const appData = Object.assign({}, application.data, application.hidden_data)

  const pagarmeAxios = axios(appData.pagarme_secret_key)

  const orderId = params.order_id
  // const { amount, buyer, payer, to, items } = params
  const { amount } = params
  console.log('> Transaction #', storeId, orderId)
  console.log('>> ', params.type)

  // https://apx-mods.e-com.plus/api/v1/create_transaction/response_schema.json?store_id=100
  const transaction = {
    amount: amount.total
  }

  const isRecurrence = params.type === 'recurrence'
  let subscriptionPagarmeId

  let redirectToPayment = false
  try {
    if (isRecurrence) {
      const methodConfigName = params.payment_method.code === 'credit_card' ? appData.credit_card.label : appData.banking_billet.label
      let labelPaymentGateway = params.payment_method.name.replace('- Pagar.me', '')
      labelPaymentGateway = labelPaymentGateway.replace(methodConfigName, '')

      const plan = getPlanInTransction(labelPaymentGateway, appData.recurrence)
      const { data: subcription } = await createSubscription(params, appData, storeId, plan)
      console.log('> Response: ', JSON.stringify(subcription))
      subscriptionPagarmeId = subcription.id
      // /invoices
      const { data: { data: invoices } } = await pagarmeAxios.get(`/invoices?subscription_id=${subscriptionPagarmeId}`)
      console.log('>>Invoices:  ', JSON.stringify(invoices))

      const { data: charge } = await pagarmeAxios.get(`/charges/${invoices[0].charge.id}`)

      console.log('>>Charge:  ', JSON.stringify(charge))
      const transactionPagarme = charge.last_transaction

      transaction.status = {
        updated_at: invoices[0].created_at || new Date().toISOString(),
        current: parserInvoiceStatusToEcom(invoices[0].status)
      }

      transaction.intermediator = {
        transaction_id: invoices[0].id,
        transaction_code: `${transactionPagarme.acquirer_auth_code || ''};`,
        transaction_reference: `${transactionPagarme.acquirer_tid}`
      }

      if (params.payment_method.code === 'banking_billet') {
        transaction.banking_billet = {
          // code: charge.last_transaction.barcode,
          valid_thrud: charge.last_transaction.due_at,
          link: charge.last_transaction.pdf
        }
        transaction.payment_link = charge.last_transaction.url
        redirectToPayment = true
      }

      // console.log('>> transaction ', JSON.stringify(transaction))

      colletionFirebase.doc(orderId)
        .set({
          storeId,
          status: subcription.status,
          orderNumber: params.order_number,
          created_at: new Date().toISOString(),
          plan,
          subscriptionPagarmeId,
          invoicePagarmeId: invoices[0].id,
          changePagarmeId: charge.id
        })
        .catch(console.error)

      console.log('> Save Firebase')

      res.send({
        redirect_to_payment: redirectToPayment,
        transaction
      })
    } else {
      //
    }
  } catch (error) {
    console.error(error)
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
    console.error(err)
    res.status(409)
    res.send({
      error: errCode,
      message
    })
  }
}

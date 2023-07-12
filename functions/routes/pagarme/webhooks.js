const getAppData = require('./../../lib/store-api/get-app-data')
const axios = require('./../../lib/pagarme/axios-create')
const {
  getOrderById,
  addPaymentHistory,
  // updateTransaction,
  getOrderIntermediatorTransactionId,
  createNewOrderBasedOld,
  updateOrder
} = require('../../lib/store-api/utils')

const { parserChangeStatusToEcom } = require('../../lib/pagarme/parse-to-ecom')

exports.post = async ({ appSdk, admin }, req, res) => {
  const colletionFirebase = admin.firestore().collection('subscriptions')
  const { body, query } = req

  try {
    const type = body.type
    const storeId = parseInt(query.store_id)
    const auth = await appSdk.getAuth(storeId)
    const appData = await getAppData({ appSdk, storeId, auth })
    const pagarmeAxios = axios(appData.pagarme_api_token)
    console.log(`>> webhook ${JSON.stringify(body)}, type:${type}`)
    if (type === 'subscription.created' && body.data) {
      const orderOriginalId = body.data?.code
      const subscriptionPagarmeId = body.data?.id
      console.log(`>> Check SubcriptionId: ${orderOriginalId}`)
      const documentSnapshot = await colletionFirebase.doc(orderOriginalId).get()
      const docSubscription = documentSnapshot.exists && documentSnapshot.data()
      if (!docSubscription) {
        console.log('> Subscription not found')
        return res.status(404)
          .send({ message: `Subscription code: #${orderOriginalId} not found` })
      } else {
        const { plan: { discount }, amount } = docSubscription
        const urlDiscount = `/subscriptions/${subscriptionPagarmeId}/discounts`
        const bodyDiscountPagarme = {
          value: discount.value,
          discount_type: discount.percentage ? 'percentage' : 'flat'
        }
        const requestPagarme = [pagarmeAxios.post(urlDiscount, bodyDiscountPagarme)]

        if (discount.percentage && amount.freight) {
          // discounted percentage is applied to all
          // necessary items add increment referring to the discount on shipping

          const urlIncrements = `subscriptions/${subscriptionPagarmeId}/increments`
          const bodyIncremetDifFreightPagarme = {
            value: ((discount.value / 100) * amount.freight),
            discount_type: 'flat',
            item_id: `pi_freight_${orderOriginalId}`
          }
          requestPagarme.push(pagarmeAxios.post(urlIncrements, bodyIncremetDifFreightPagarme))
        }

        try {
          await Promise.all(requestPagarme)
          console.log('>> Discount and/or increment updated')
          res.status(201)
            .send({ message: 'Discount and/or increment updated' })
        } catch (error) {
          console.error(error)
          const errCode = 'WEBHOOK_PAGARME_INVOICE_CREATED'
          let status = 409
          let message = error.message
          if (error.response) {
            status = error.response.status || status
            const { data } = error.response
            if (status !== 401 && status !== 403) {
              message = error.response.message || message
            } else if (data && Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) {
              message = data.errors[0].message
            }
          }
          return res.status(status || 400)
            .send({
              error: errCode,
              message
            })
        }
      }
    } else if (type === 'subscription.canceled' && body.data) {
      const { data: subscription } = await pagarmeAxios.get(`/subscriptions/${body.data.id}`)
      if (subscription && subscription.status === 'canceled') {
        const orderOriginalId = subscription.code
        const orderOriginal = await getOrderById(appSdk, storeId, orderOriginalId, auth)
        if (!orderOriginal) {
          console.log('>> Order status canceled')
          return res.sendStatus(404)
        } else if (orderOriginal.status !== 'cancelled') {
          await updateOrder(appSdk, storeId, orderOriginalId, auth, { status: 'cancelled' })
          console.log('>> Status update Cancelled')
          return res.sendStatus(200)
        } else {
          console.log('>> Order status canceled')
          return res.sendStatus(200)
        }
      } else {
        return res.status(!subscription ? 404 : 400)
          .send({ message: !subscription ? 'Not found subscription' : 'Subscription not canceled' })
      }
    } else if (type.startsWith('charge.')) {
      // const statusChange = type.replace('charge.', '')
      const { data: charge } = await pagarmeAxios.get(`/charges/${body.data.id}`)
      console.log('>>Charge ', JSON.stringify(charge))
      if (charge.invoice) {
        const { invoice, status } = charge
        const order = await getOrderIntermediatorTransactionId(appSdk, storeId, invoice.id, auth)
        if (order) {
          if (order.financial_status.current !== parserChangeStatusToEcom(status)) {
            // updadte status
            const transaction = order.transactions.find(transaction => transaction.intermediator.transaction_id === invoice.id)
            console.log('>> Try add payment history')
            const transactionPagarme = charge.last_transaction
            let notificationCode = `${type};${body.id};`
            if (transactionPagarme.transaction_type === 'credit_card') {
              notificationCode += `${transactionPagarme.gateway_id || ''};`
              notificationCode += `${transactionPagarme.acquirer_tid || ''};`
              notificationCode += `${transactionPagarme.acquirer_nsu || ''};`
              notificationCode += `${transactionPagarme.acquirer_auth_code || ''};`
            } else if (transactionPagarme.transaction_type === 'boleto') {
              notificationCode += `${transactionPagarme.gateway_id || ''};`
            }
            const bodyPaymentHistory = {
              date_time: transactionPagarme.updated_at || new Date().toISOString(),
              status: parserChangeStatusToEcom(status),
              notification_code: notificationCode,
              flags: ['PagarMe']
            }
            if (transaction && transaction._id) {
              bodyPaymentHistory.transaction_id = transaction._id
            }
            await addPaymentHistory(appSdk, storeId, order._id, auth, bodyPaymentHistory)
            console.log('>> Status update to paid')
            return res.sendStatus(200)
          } else {
            console.log(`Status is ${parserChangeStatusToEcom(status)}`)
            return res.sendStatus(200)
          }
        } else {
          if (status === 'paid') {
            console.log('>> Try create new order for recurrence')
            const { data: subscription } = await pagarmeAxios.get(`/subscriptions/${invoice.subscriptionId}`)
            const orderOriginal = await getOrderById(appSdk, storeId, subscription.code)
            const documentSnapshot = await colletionFirebase.doc(subscription.code).get()
            const docSubscription = documentSnapshot.exists && documentSnapshot.data()
            if (orderOriginal && docSubscription) {
              const { plan } = docSubscription
              await createNewOrderBasedOld(appSdk, storeId, auth, orderOriginal, plan, 'paid', charge, subscription)
              console.log('>> Create new Order')
              return res.sendStatus(201)
            } else {
              console.log('>> Subscription not found')
              return res.status(404)
                .send({ message: `Subscription code: #${subscription.code} not found` })
            }
          }
        }
      }
      // TODO:
      // payment update (order in pagarme)
    }
  } catch (error) {
    console.error(error)
    const errCode = 'WEBHOOK_PAGARME_INTERNAL_ERR'
    let status = 409
    let message = error.message
    if (error.response) {
      status = error.response.status || status
      const { data } = error.response
      if (status !== 401 && status !== 403) {
        message = error.response.message || message
      } else if (data && Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) {
        message = data.errors[0].message
      }
    }
    return res.status(status || 500)
      .send({
        error: errCode,
        message
      })
  }
}

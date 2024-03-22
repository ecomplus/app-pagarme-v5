// read configured E-Com Plus app data
const getAppData = require('./../../lib/store-api/get-app-data')
const axios = require('./../../lib/pagarme/axios-create')
const {
  updateOrder,
  getOrderWithQueryString,
  getOrderById,
  getProductById
} = require('../../lib/store-api/utils')

const {
  getDocFirestore
  // updateDocFirestore
} = require('../../lib/firestore/utils')
const ecomUtils = require('@ecomplus/utils')

const SKIP_TRIGGER_NAME = 'SkipTrigger'
const ECHO_SUCCESS = 'SUCCESS'
const ECHO_SKIP = 'SKIP'
const ECHO_API_ERROR = 'STORE_API_ERR'

exports.post = async ({ appSdk, admin }, req, res) => {
  // receiving notification from Store API
  const { storeId } = req

  /**
   * Treat E-Com Plus trigger body here
   * Ref.: https://developers.e-com.plus/docs/api/#/store/triggers/
   */
  const trigger = req.body
  const resourceId = trigger.resource_id || trigger.inserted_id

  try {
    const auth = appSdk.getAuth(storeId)
    // get app configured options
    const appData = await getAppData({ appSdk, storeId, auth })
    const pagarmeAxios = axios(appData.pagarme_api_token)
    const colletionFirebase = admin.firestore().collection('subscriptions')

    const { resource, body, action } = trigger
    if (
      Array.isArray(appData.ignore_triggers) &&
      appData.ignore_triggers.indexOf(trigger.resource) > -1
    ) {
      // ignore current trigger
      const err = new Error()
      err.name = SKIP_TRIGGER_NAME
      throw err
    }

    if (resource === 'orders') {
      if (body?.status === 'cancelled') {
        const order = await getOrderById(appSdk, storeId, resourceId, auth)
        if (order?.transactions?.length && order?.transactions[0]?.type === 'recurrence') {
          const { data: { data: subcriptions } } = await pagarmeAxios.get(`/subscriptions?code=${resourceId}`)
          if (subcriptions && subcriptions[0].status !== 'canceled') {
            try {
              console.log(`>> Webhook E-com: Try cancel subscription Pagar.Me code: #${resourceId}`)
              await pagarmeAxios.delete(`/subscriptions/${subcriptions[0].id}`)
              console.log('>> Webhook E-com: Successfully canceled')
              res.send(ECHO_SUCCESS)
              colletionFirebase.doc(resourceId)
                .set({
                  status: 'cancelled',
                  updatedAt: new Date().toISOString()
                }, { merge: true })
                .catch(console.error)
            } catch (err) {
              console.error(`>> Webhook E-com: Error when canceling in Pagar.Me, return the status #${resourceId}`)
              await updateOrder(appSdk, storeId, resourceId, auth, { status: 'open' })
              res.send(ECHO_SUCCESS)
            }
          } else {
            console.log(`>> Webhook E-com: Subscription #${resourceId} already canceled or does not exist`)
            res.send(ECHO_SUCCESS)
          }
        } else {
          console.warn(`Warn: Order ${order ? JSON.stringify(order) : ' not found'}`)
        }
        // edit items order order Original
        //
      }
    } else if (resource === 'products' && action === 'change') {
      console.log('> Edit product ', resourceId, 's: ', storeId)

      let query = 'status!=cancelled&transactions.type=recurrence'
      query += '&transactions.app.intermediator.code=pagarme'
      query += `&items.product_id=${resourceId}`

      const result = await getOrderWithQueryString(appSdk, storeId, query, auth)
      const product = await getProductById(appSdk, storeId, resourceId, auth)
      if (result && result.length) {
        for (let i = 0; i < result.length; i++) {
          const updateItemPagarme = []
          const order = await getOrderById(appSdk, storeId, result[i]._id, auth)
          const docSubscription = await getDocFirestore(colletionFirebase, result[i]._id)
          console.log('>> order ', JSON.stringify(order), ' ', JSON.stringify(docSubscription))
          if (order && docSubscription) {
            const itemsUpdate = []
            order.items.forEach(orderItem => {
              if (orderItem.product_id === product._id) {
                if (orderItem.variation_id) {
                  const variation = product.variations.find(itemFind => itemFind.sku === orderItem.sku)
                  let quantity = orderItem.quantity
                  if (variation && variation.quantity < orderItem.quantity) {
                    quantity = variation.quantity
                  } else if (!variation) {
                    quantity = 0
                  }
                  const newItem = {
                    sku: variation.sku,
                    price: ecomUtils.price({ ...product, ...variation }),
                    quantity
                  }
                  if ((orderItem.final_price && orderItem.final_price !== newItem.price) ||
                    orderItem.price !== newItem.price || orderItem.quantity !== newItem.quantity) {
                    itemsUpdate.push(newItem)
                  }
                } else {
                  const newItem = {
                    sku: product.sku,
                    price: ecomUtils.price(product),
                    quantity: product.quantity < orderItem.quantity ? product.quantity : orderItem.quantity
                  }
                  if ((orderItem.final_price && orderItem.final_price !== newItem.price) ||
                    orderItem.price !== newItem.price || orderItem.quantity !== newItem.quantity) {
                    itemsUpdate.push(newItem)
                  }
                }
              }
            })

            if (itemsUpdate.length) {
              docSubscription?.items?.forEach(itemPagarme => {
                const itemToEdit = itemsUpdate.find(itemFind => itemPagarme.id === `pi_${itemFind.sku}`)
                if (itemToEdit && !itemPagarme.cycles) {
                  itemPagarme.quantity = itemToEdit.quantity
                  itemPagarme.pricing_scheme.price = Math.floor((itemToEdit.price) * 100)
                  updateItemPagarme.push({ subscription_id: docSubscription.subscriptionPagarmeId, item: itemPagarme })
                }
              })
            }
          }
          // order not found or error
          if (updateItemPagarme.length) {
            console.log('>> Try update item in Pagar.Me')
            try {
              //
              await Promise.all(updateItemPagarme.map(itemPagarme => {
                return pagarmeAxios.put(
                  `/subscriptions/${itemPagarme.subscription_id}/items/${itemPagarme.item.id}`,
                  {
                    ...itemPagarme.item
                  }
                )
              }))
              console.log('>>> Update SUCESSS')
              res.send(ECHO_SUCCESS)
            } catch (err) {
              console.log('err ', err)
              // When creating a new order, check the items saved in Pagar.Me with the original order items
              // No need to save to firestore
            }
          }
        }
      }
      console.log('>> not found ')
    }
    // More Trigger
  } catch (err) {
    if (err.name === SKIP_TRIGGER_NAME) {
      // trigger ignored by app configuration
      res.send(ECHO_SKIP)
    } else if (err.appWithoutAuth === true) {
      const msg = `Webhook for ${storeId} unhandled with no authentication found`
      const error = new Error(msg)
      error.trigger = JSON.stringify(trigger)
      console.error(error)
      res.status(412)
        .send(msg)
    } else {
      console.error(err)
      // request to Store API with error response
      // return error status code
      const { message } = err
      res.status(500)
        .send({
          error: ECHO_API_ERROR,
          message
        })
    }
  }
}
